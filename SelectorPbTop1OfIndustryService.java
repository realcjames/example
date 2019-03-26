package com.wnbt.selector.service.pb;

import cn.huoqiu.base.lang.Lists;
import com.wnbt.base.utils.DateUtil;
import com.wnbt.base.utils.PinYinUtil;
import com.wnbt.entity.AShareIndustriesClass;
import com.wnbt.selector.model.ComparatorField;
import com.wnbt.selector.model.pb.SelectorPbTop1OfIndustryModel;
import com.wnbt.selector.service.BaseSelectorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Created by chenchen on 2017/9/15 19:04
 * Description:市净率行业排名第一选股器service
 */
@Service
public class SelectorPbTop1OfIndustryService extends BaseSelectorService {
    @Override
    public Logger getLogger() {
        return LoggerFactory.getLogger(SelectorPbTop1OfIndustryService.class);
    }

    @Override
    public boolean isExecute() {
        Calendar calendar = Calendar.getInstance();
        calendar.add(Calendar.DATE, -1);
        return getaShareCalendarService().isTradeDate(new SimpleDateFormat("yyyyMMdd ").format(calendar.getTime()));
    }

    /**
     * 计算：
     * 1.先将ASHAREINDUSTRIESCLASS和ASHAREINDUSTRIESCODE两个表连接，取出所有股票的股票代码+行业代码+行业名
     * 2.再取出上一个交易日的所有ASHAREEODDERIVATIVEINDICATOR
     * 3.对第一步中选出的所有股票list进行循环，封装成一个map，行业代码为key，日行情估值指标的list为value
     * 4.最后再分别对每一个行业的list进行进行市净率的倒序排序，并取出第一个，即最大值，塞进resultList
     * <p>
     * 表：stock_info.ASHAREINDUSTRIESCLASS，更新时间：09:00,18:00
     * 表：stock_info.ASHAREEODDERIVATIVEINDICATOR，更新时间：16:00,17:00
     * 表：stock_info.ASHAREINDUSTRIESCODE，更新时间：08:00
     * <p>
     *
     * @return
     */
    @Override
    public List<SelectorPbTop1OfIndustryModel> getSelectorData() {
        String date = getaShareCalendarService().getLastTradeDay(String.valueOf(DateUtil.now()));
        // 先将ASHAREINDUSTRIESCLASS和ASHAREINDUSTRIESCODE两个表连接，取出所有股票的股票代码+行业代码+行业名
        List<AShareIndustriesClass> aShareIndustriesClassList = getInfoDB().from("ASHAREINDUSTRIESCLASS a LEFT JOIN ASHAREINDUSTRIESCODE b ON b.INDUSTRIESCODE=a.WIND_IND_CODE")
                .select("DISTINCT a.WIND_IND_CODE AS windIndCode, left(a.S_INFO_WINDCODE,6) AS stockCode, b.INDUSTRIESNAME AS industriesName")
                .where("a.CUR_SIGN", "1").all(AShareIndustriesClass.class);

        // 再取出上一个交易日的所有ASHAREEODDERIVATIVEINDICATOR
        List<SelectorPbTop1OfIndustryModel> modelList = getInfoDB().from("ASHAREEODDERIVATIVEINDICATOR").select("left(S_INFO_WINDCODE,6) AS stockCode,S_VAL_PB_NEW AS pb")
                .where("TRADE_DT", date)
                .isNotNull("S_VAL_PB_NEW").all(SelectorPbTop1OfIndustryModel.class);
        Map<String, SelectorPbTop1OfIndustryModel> modelMap = new HashMap<>();
        for (SelectorPbTop1OfIndustryModel model : modelList) {
            modelMap.put(model.getStockCode(), model);
        }

        // 下面对所有股票进行循环，封装成一个map，行业代码为key，日行情估值指标的list为value
        Map<String, List<SelectorPbTop1OfIndustryModel>> industriesModelMap = new HashMap<>();
        for (AShareIndustriesClass aShareIndustriesClass : aShareIndustriesClassList) {
            List<SelectorPbTop1OfIndustryModel> industriesModelList;
            if (industriesModelMap.containsKey(aShareIndustriesClass.getWindIndCode())) {
                industriesModelList = industriesModelMap.get(aShareIndustriesClass.getWindIndCode());
            } else {
                industriesModelList = Lists.newArrayList();
            }

            if (!modelMap.containsKey(aShareIndustriesClass.getStockCode())) {
                continue;
            }
            SelectorPbTop1OfIndustryModel industriesModel = modelMap.get(aShareIndustriesClass.getStockCode());
            if (industriesModel == null) {
                continue;
            }
            industriesModel.setIndustriesName(aShareIndustriesClass.getIndustriesName());
            industriesModel.setIndustriesNamePinYinFirstLetter(PinYinUtil.getPinYinHeadChar(aShareIndustriesClass.getIndustriesName()));
            industriesModelList.add(industriesModel);
            industriesModelMap.put(aShareIndustriesClass.getWindIndCode(), industriesModelList);
        }

        // 最后再分别对每一个行业的list进行进行市净率的倒序排序，并取出第一个，即最大值，塞进resultList
        List<SelectorPbTop1OfIndustryModel> resultList = Lists.newArrayList();
        for (Map.Entry<String, List<SelectorPbTop1OfIndustryModel>> entry : industriesModelMap.entrySet()) {
            listComparator(entry.getValue(), new ComparatorField("pb", true));
            resultList.add(entry.getValue().get(0));
        }

        return resultList;
    }
}
