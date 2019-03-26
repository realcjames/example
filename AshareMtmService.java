package com.wnbt.calc.tech.service;

import cn.huoqiu.base.db.Query;
import cn.huoqiu.base.lang.Lists;
import com.wnbt.base.utils.WindUtils;
import com.wnbt.entity.AshareEodPrices;
import com.wnbt.entity.AshareMtm;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

/**
 * Created by chenchen on 2017/10/10 15:11
 * Description:计算股票的mtm指标并存到数据库 Service
 */
@Service
public class AshareMtmService extends AshareBaseTechService{

    @Override
    protected Logger getLogger(){
        return LoggerFactory.getLogger(AshareMtmService.class);
    }

    @Override
    public void calcStock(String stockCode) {
        AshareMtm ashareMtm = getFirericeDB().from(AshareMtm.class)
                .where("stock_code", stockCode)
                .orderBy("trade_dt DESC")
                .first(AshareMtm.class);
        Query query = getInfoDB().from("AShareEODPrices")
                .where("S_INFO_WINDCODE", WindUtils.transToWindStockCode(stockCode))
                .not("S_DQ_TRADESTATUS", "停牌");
        if (ashareMtm != null) {
            query.great("trade_dt", ashareMtm.getTradeDt());
        }
        List<AshareEodPrices> aShareEODPricesListAfter = query.orderBy("TRADE_DT ASC").all(AshareEodPrices.class);
        List<AshareEodPrices> aShareEODPricesList;

        if (aShareEODPricesListAfter == null || aShareEODPricesListAfter.isEmpty()) {
            return;
        }

        if (ashareMtm != null) { // 如果不需要进行初始化，那么需要再往前取12条数据
            aShareEODPricesList = getInfoDB().from("AShareEODPrices")
                    .where("S_INFO_WINDCODE", WindUtils.transToWindStockCode(stockCode))
                    .not("S_DQ_TRADESTATUS", "停牌")
                    .less("TRADE_DT", aShareEODPricesListAfter.get(0).getTradeDt())
                    .orderBy("TRADE_DT DESC")
                    .limit(12).all(AshareEodPrices.class);
            if (aShareEODPricesList == null || aShareEODPricesList.isEmpty() || aShareEODPricesList.size() < 12) {
                return;
            }

            Collections.reverse(aShareEODPricesList);
            aShareEODPricesList.addAll(aShareEODPricesListAfter);
        } else {
            aShareEODPricesList = aShareEODPricesListAfter;
        }

        if (aShareEODPricesList.isEmpty()) {
            return;
        }
        List<AshareMtm> modelListNoMa = Lists.newArrayList();
        List<AshareMtm> modelListHasMa = Lists.newArrayList();
        List<AshareMtm> modelList = Lists.newArrayList();
        if (aShareEODPricesList.size() < 13) {
            return; // 至少需要13条数据
        }

        if (ashareMtm == null) { // 如果为空则需要初始化
            for (int i = 12; i < aShareEODPricesList.size(); i++) {
                AshareEodPrices aShareEODPrices = aShareEODPricesList.get(i);
                AshareMtm model = new AshareMtm();
                model.setStockCode(aShareEODPrices.getsInfoWindcode().substring(0, 6));
                model.setTradeDt(aShareEODPrices.getTradeDt());
                BigDecimal sDqAdjclose = aShareEODPrices.getsDqAdjclose();
                model.setMtm(sDqAdjclose.subtract(aShareEODPricesList.get(i - 12).getsDqAdjclose()));
                if (modelList.size() >= 5) {
                    BigDecimal sumMtm = model.getMtm();
                    for (int j = 1; j <= 5; j++) {
                        sumMtm = sumMtm.add(modelList.get(modelList.size() - j).getMtm());
                    }
                    model.setMamtm(sumMtm.divide(new BigDecimal(6), 3, BigDecimal.ROUND_HALF_UP));
                }
                modelList.add(model);
                if (model.getMamtm() == null) { // 有mamtm的和没有的，分开两个list，不然batchinsert会报错
                    modelListNoMa.add(model);
                } else {
                    modelListHasMa.add(model);
                }
            }
        } else {
            for (int i = 12; i < aShareEODPricesList.size(); i++) {
                AshareEodPrices aShareEODPrices = aShareEODPricesList.get(i);
                AshareMtm model = new AshareMtm();
                model.setStockCode(aShareEODPrices.getsInfoWindcode().substring(0, 6));
                model.setTradeDt(aShareEODPrices.getTradeDt());
                BigDecimal sDqAdjclose = aShareEODPrices.getsDqAdjclose();
                model.setMtm(sDqAdjclose.subtract(aShareEODPricesList.get(i - 12).getsDqAdjclose()).setScale(3, BigDecimal.ROUND_HALF_UP));
                List<AshareMtm> ashareMtmList = getFirericeDB().from(AshareMtm.class).select("mtm").where("stock_code", stockCode).less("trade_dt", aShareEODPrices.getTradeDt())
                        .orderBy("trade_dt desc").limit(5).all(AshareMtm.class);
                if (ashareMtmList.size() == 5) {
                    BigDecimal sumMtm = model.getMtm();
                    for (AshareMtm mtmModel : ashareMtmList) {
                        sumMtm = sumMtm.add(mtmModel.getMtm());
                    }
                    model.setMamtm(sumMtm.divide(new BigDecimal(6), 3, BigDecimal.ROUND_HALF_UP));
                }
                modelList.add(model);
                if (model.getMamtm() == null) { // 有mamtm的和没有的，分开两个list，不然batchinsert会报错
                    modelListNoMa.add(model);
                } else {
                    modelListHasMa.add(model);
                }
            }
        }

        if (modelListNoMa.size() > 0) {
            getFirericeDB().batchInsert(modelListNoMa);
        }
        if (modelListHasMa.size() > 0) {
            getFirericeDB().batchInsert(modelListHasMa);
        }
    }
}
