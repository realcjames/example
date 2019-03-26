package com.wnbt.calc.tech.service;

import cn.huoqiu.base.db.Query;
import cn.huoqiu.base.lang.Lists;
import com.wnbt.base.utils.WindUtils;
import com.wnbt.entity.AshareEodPrices;
import com.wnbt.entity.AshareRsi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

/**
 * Created by chenchen on 2017/10/17 14:20
 * Description:计算股票的RSI指标并存到数据库 service
 */
@Service
public class AshareRsiService extends AshareBaseTechService{

    @Override
    protected Logger getLogger(){
        return LoggerFactory.getLogger(AshareRsiService.class);
    }

    @Override
    public void calcStock(String stockCode) {
        AshareRsi ashareRsi = getFirericeDB().from(AshareRsi.class)
                .where("stock_code", stockCode)
                .orderBy("trade_dt DESC")
                .first(AshareRsi.class);
        Query query = getInfoDB().from("AShareEODPrices")
                .where("S_INFO_WINDCODE", WindUtils.transToWindStockCode(stockCode))
                .not("S_DQ_TRADESTATUS", "停牌");
        if (ashareRsi != null) {
            query.greatOrEquals("trade_dt", ashareRsi.getTradeDt());
        }
        List<AshareEodPrices> aShareEODPricesList = query.orderBy("TRADE_DT ASC").all(AshareEodPrices.class);

        if (aShareEODPricesList == null || aShareEODPricesList.isEmpty()) {
            return;
        }

        // 因为每天的指标都有可能有某个值是空的，firericeDB.batchInsert就可能会报错，只能分情况分别插入
        List<AshareRsi> models = Lists.newArrayList();
        List<AshareRsi> modelList = Lists.newArrayList();
        List<AshareRsi> modelListA = Lists.newArrayList();
        List<AshareRsi> modelListB = Lists.newArrayList();
        List<AshareRsi> modelListC = Lists.newArrayList();
        List<AshareRsi> modelListAB = Lists.newArrayList();
        List<AshareRsi> modelListAC = Lists.newArrayList();
        List<AshareRsi> modelListBC = Lists.newArrayList();
        List<AshareRsi> modelListABC = Lists.newArrayList();

        if (ashareRsi == null) { // 为空则需要初始化，单独把第一天的数据插入表中
            AshareRsi model = new AshareRsi();
            model.setStockCode(stockCode);
            model.setAvgInc6d(new BigDecimal(0));
            model.setAvgDec6d(new BigDecimal(0));
            model.setAvgInc12d(new BigDecimal(0));
            model.setAvgDec12d(new BigDecimal(0));
            model.setAvgInc24d(new BigDecimal(0));
            model.setAvgDec24d(new BigDecimal(0));
            model.setTradeDt(aShareEODPricesList.get(0).getTradeDt());
            models.add(model);
            getFirericeDB().batchInsert(models);
            models = Lists.newArrayList();
            if (aShareEODPricesList.size() == 1) {
                return;
            }
        }

        for (int i = 1; i < aShareEODPricesList.size(); i++) {
            AshareEodPrices aShareEODPrices = aShareEODPricesList.get(i);
            AshareEodPrices preAShareEODPrices = aShareEODPricesList.get(i - 1);
            String tradeDt = aShareEODPrices.getTradeDt();
            String preTradeDt = preAShareEODPrices.getTradeDt();
            BigDecimal sDqAdjclose = aShareEODPrices.getsDqAdjclose();
            BigDecimal preSDqAdjclose = preAShareEODPrices.getsDqAdjclose();
            AshareRsi model = new AshareRsi();
            model.setStockCode(aShareEODPrices.getsInfoWindcode().substring(0, 6));
            model.setTradeDt(tradeDt);
            AshareRsi preAshareRsi;
            if (i == 1) {
                preAshareRsi = getFirericeDB().from(AshareRsi.class)
                        .where("stock_code", stockCode)
                        .where("trade_dt", preTradeDt)
                        .first(AshareRsi.class);
            } else {
                preAshareRsi = models.get(i - 2);
            }
            if (preAshareRsi == null) {
                return;
            }
            BigDecimal preAvgInc6d = preAshareRsi.getAvgInc6d();
            BigDecimal preAvgDec6d = preAshareRsi.getAvgDec6d();
            BigDecimal preAvgInc12d = preAshareRsi.getAvgInc12d();
            BigDecimal preAvgDec12d = preAshareRsi.getAvgDec12d();
            BigDecimal preAvgInc24d = preAshareRsi.getAvgInc24d();
            BigDecimal preAvgDec24d = preAshareRsi.getAvgDec24d();
            BigDecimal incToday = max(sDqAdjclose, preSDqAdjclose);
            BigDecimal decToday = max(preSDqAdjclose, sDqAdjclose);
            BigDecimal avgInc6d = incToday.add(new BigDecimal(5).multiply(preAvgInc6d)).divide(new BigDecimal(6), 6, BigDecimal.ROUND_HALF_UP);
            BigDecimal avgDec6d = decToday.add(new BigDecimal(5).multiply(preAvgDec6d)).divide(new BigDecimal(6), 6, BigDecimal.ROUND_HALF_UP);
            BigDecimal avgInc12d = incToday.add(new BigDecimal(11).multiply(preAvgInc12d)).divide(new BigDecimal(12), 6, BigDecimal.ROUND_HALF_UP);
            BigDecimal avgDec12d = decToday.add(new BigDecimal(11).multiply(preAvgDec12d)).divide(new BigDecimal(12), 6, BigDecimal.ROUND_HALF_UP);
            BigDecimal avgInc24d = incToday.add(new BigDecimal(23).multiply(preAvgInc24d)).divide(new BigDecimal(24), 6, BigDecimal.ROUND_HALF_UP);
            BigDecimal avgDec24d = decToday.add(new BigDecimal(23).multiply(preAvgDec24d)).divide(new BigDecimal(24), 6, BigDecimal.ROUND_HALF_UP);
            if (avgDec6d.compareTo(BigDecimal.ZERO) != 0) {
                model.setRsi6d(avgInc6d.divide(avgInc6d.add(avgDec6d), 4, BigDecimal.ROUND_HALF_UP).movePointRight(2));
            }
            model.setAvgInc6d(avgInc6d);
            model.setAvgDec6d(avgDec6d);
            if (avgDec12d.compareTo(BigDecimal.ZERO) != 0) {
                model.setRsi12d(avgInc12d.divide(avgInc12d.add(avgDec12d), 4, BigDecimal.ROUND_HALF_UP).movePointRight(2));
            }
            model.setAvgInc12d(avgInc12d);
            model.setAvgDec12d(avgDec12d);
            if (avgDec24d.compareTo(BigDecimal.ZERO) != 0) {
                model.setRsi24d(avgInc24d.divide(avgInc24d.add(avgDec24d), 4, BigDecimal.ROUND_HALF_UP).movePointRight(2));
            }
            model.setAvgInc24d(avgInc24d);
            model.setAvgDec24d(avgDec24d);
            models.add(model);
            if (model.getRsi6d() != null && model.getRsi12d() != null && model.getRsi24d() != null) {
                modelList.add(model);
            }
            if (model.getRsi6d() == null && model.getRsi12d() != null && model.getRsi24d() != null) {
                modelListA.add(model);
            }
            if (model.getRsi6d() != null && model.getRsi12d() == null && model.getRsi24d() != null) {
                modelListB.add(model);
            }
            if (model.getRsi6d() != null && model.getRsi12d() != null && model.getRsi24d() == null) {
                modelListC.add(model);
            }
            if (model.getRsi6d() == null && model.getRsi12d() == null && model.getRsi24d() != null) {
                modelListAB.add(model);
            }
            if (model.getRsi6d() == null && model.getRsi12d() != null && model.getRsi24d() == null) {
                modelListAC.add(model);
            }
            if (model.getRsi6d() != null && model.getRsi12d() == null && model.getRsi24d() == null) {
                modelListBC.add(model);
            }
            if (model.getRsi6d() == null && model.getRsi12d() == null && model.getRsi24d() == null) {
                modelListABC.add(model);
            }
        }

        if (modelList.size() > 0) {
            getFirericeDB().batchInsert(modelList);
        }
        if (modelListA.size() > 0) {
            getFirericeDB().batchInsert(modelListA);
        }
        if (modelListB.size() > 0) {
            getFirericeDB().batchInsert(modelListB);
        }
        if (modelListC.size() > 0) {
            getFirericeDB().batchInsert(modelListC);
        }
        if (modelListAB.size() > 0) {
            getFirericeDB().batchInsert(modelListAB);
        }
        if (modelListAC.size() > 0) {
            getFirericeDB().batchInsert(modelListAC);
        }
        if (modelListBC.size() > 0) {
            getFirericeDB().batchInsert(modelListBC);
        }
        if (modelListABC.size() > 0) {
            getFirericeDB().batchInsert(modelListABC);
        }
    }

    /**
     * 若x>y则返回x-y，否则返回0
     *
     * @param x
     * @param y
     * @return
     */
    private BigDecimal max(BigDecimal x, BigDecimal y) {
        if (x == null || y == null || x.compareTo(BigDecimal.ZERO) == 0 || y.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }

        if (x.compareTo(y) > 0) {
            return x.subtract(y);
        }

        return BigDecimal.ZERO;
    }
}
