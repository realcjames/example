package com.wnbt.calc.tech.service;

import cn.huoqiu.base.db.Query;
import cn.huoqiu.base.lang.Lists;
import com.wnbt.base.utils.WindUtils;
import com.wnbt.entity.AshareCci;
import com.wnbt.entity.AshareEodPrices;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

/**
 * Created by chenchen on 2017/10/19 14:21
 * Description:计算股票的CCI指标并存到数据库 Service
 */
@Service
public class AshareCciService extends AshareBaseTechService{

    @Override
    protected Logger getLogger(){
        return LoggerFactory.getLogger(AshareCciService.class);
    }

    @Override
    public void calcStock(String stockCode) {
        AshareCci ashareCci = getFirericeDB().from(AshareCci.class)
                .where("stock_code", stockCode)
                .orderBy("trade_dt DESC")
                .first(AshareCci.class);
        Query query = getInfoDB().from("AShareEODPrices")
                .where("S_INFO_WINDCODE", WindUtils.transToWindStockCode(stockCode))
                .not("S_DQ_TRADESTATUS", "停牌");
        if (ashareCci != null) {
            query.great("trade_dt", ashareCci.getTradeDt());
        }
        List<AshareEodPrices> aShareEODPricesList = query.orderBy("TRADE_DT ASC").all(AshareEodPrices.class);

        if (aShareEODPricesList == null || aShareEODPricesList.isEmpty()) {
            return;
        }
        List<AshareCci> modelList = Lists.newArrayList();
        List<AshareCci> modelListHasCci = Lists.newArrayList();
        List<AshareCci> modelListNoCci = Lists.newArrayList();

        if (ashareCci == null) { // 为空即需要进行初始化，要把前13天的typ先计算好
            for (int i = 0; i < aShareEODPricesList.size(); i++) {
                AshareCci model = new AshareCci();
                AshareEodPrices ashareEodPrices = aShareEODPricesList.get(i);
                model.setStockCode(ashareEodPrices.getsInfoWindcode().substring(0, 6));
                model.setTradeDt(ashareEodPrices.getTradeDt());
                BigDecimal sDqAdjhigh = ashareEodPrices.getsDqAdjhigh();
                BigDecimal sDqAdjlow = ashareEodPrices.getsDqAdjlow();
                BigDecimal sDqAdjclose = ashareEodPrices.getsDqAdjclose();
                BigDecimal typParam1 = sDqAdjhigh == null ? sDqAdjclose : sDqAdjhigh; // 计算typ所需要的参数1
                BigDecimal typParam2 = sDqAdjlow == null ? sDqAdjclose : sDqAdjlow; // 计算typ所需要的参数2
                BigDecimal typ = typParam1.add(typParam2).add(sDqAdjclose).divide(new BigDecimal(3), 4, BigDecimal.ROUND_HALF_UP);
                model.setTyp(typ);
                if (i > 12) {
                    model.setCci(getCci(modelList.subList(i - 13, i), typ));
                }

                modelList.add(model);
                if (model.getCci() == null) {
                    modelListNoCci.add(model);
                } else {
                    modelListHasCci.add(model);
                }

            }
        } else { // 不需要初始化则需要取前13天的数据用于计算
            String startDt = aShareEODPricesList.get(0).getTradeDt();
            modelList = getFirericeDB().from(AshareCci.class)
                    .where("stock_code", stockCode)
                    .less("trade_dt", startDt)
                    .orderBy("trade_dt DESC")
                    .limit(13)
                    .all(AshareCci.class);
            if (modelList.size() < 13) {
                return;
            }
            Collections.reverse(modelList);

            for (int i = 0; i < aShareEODPricesList.size(); i++) {
                AshareCci model = new AshareCci();
                AshareEodPrices ashareEodPrices = aShareEODPricesList.get(i);
                model.setStockCode(ashareEodPrices.getsInfoWindcode().substring(0, 6));
                model.setTradeDt(ashareEodPrices.getTradeDt());
                BigDecimal sDqAdjhigh = ashareEodPrices.getsDqAdjhigh();
                BigDecimal sDqAdjlow = ashareEodPrices.getsDqAdjlow();
                BigDecimal sDqAdjclose = ashareEodPrices.getsDqAdjclose();
                BigDecimal typParam1 = sDqAdjhigh == null ? sDqAdjclose : sDqAdjhigh; // 计算typ所需要的参数1
                BigDecimal typParam2 = sDqAdjlow == null ? sDqAdjclose : sDqAdjlow; // 计算typ所需要的参数2
                BigDecimal typ = typParam1.add(typParam2).add(sDqAdjclose).divide(new BigDecimal(3), 4, BigDecimal.ROUND_HALF_UP);
                model.setTyp(typ);
                model.setCci(getCci(modelList.subList(i, i + 13), typ));
                modelList.add(model);
                if (model.getCci() == null) {
                    modelListNoCci.add(model);
                } else {
                    modelListHasCci.add(model);
                }

            }
        }

        if (modelListNoCci.size() > 0) {
            getFirericeDB().batchInsert(modelListNoCci);
        }
        if (modelListHasCci.size() > 0) {
            getFirericeDB().batchInsert(modelListHasCci);
        }
    }

    /**
     * CCI计算
     *
     * @param ashareCciList
     * @param typToday
     * @return
     */
    private BigDecimal getCci(List<AshareCci> ashareCciList, BigDecimal typToday) {
        if (ashareCciList.size() != 13) {
            return null;
        }

        BigDecimal sumTyp = BigDecimal.ZERO;
        BigDecimal avgTyp;
        BigDecimal sumAvgTyp = BigDecimal.ZERO;
        for (AshareCci ashareCci : ashareCciList) {
            sumTyp = sumTyp.add(ashareCci.getTyp());
        }
        sumTyp = sumTyp.add(typToday);

        avgTyp = sumTyp.divide(new BigDecimal(14), 4, BigDecimal.ROUND_HALF_UP);
        for (AshareCci ashareCci : ashareCciList) {
            sumAvgTyp = sumAvgTyp.add(ashareCci.getTyp().subtract(avgTyp).abs());
        }
        sumAvgTyp = sumAvgTyp.add(typToday.subtract(avgTyp).abs());

        try {
            return (typToday.multiply(new BigDecimal(14)).subtract(sumTyp)).divide(new BigDecimal(0.015).multiply(sumAvgTyp), 2, BigDecimal.ROUND_HALF_UP);
        } catch (Exception e) {
            return null;
        }

    }
}
