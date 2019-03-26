import autobind from 'autobind-decorator';
import update from 'immutability-helper/index';
import moment from 'moment/moment';
import qs from 'qs';
import React from 'react';
import deepCompare from 'react-fast-compare';
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import CustomerCellField from 'src/components/common/CustomerCellField';
import DetailField from 'src/components/common/DetailField.jsx';
import SectionHeader from 'src/components/common/DetailSectionHeader.jsx';
import DropdownSelector from 'src/components/common/DropdownSelector.jsx';
import FooterButtonSection from 'src/components/common/FooterButtonSection.jsx';
import MySwitch from 'src/components/common/MySwitch.jsx';
import MyTextInput from 'src/components/common/MyTextInput.jsx';
import AddPaymentButton from 'src/components/common/OrderAddPaymentButton.jsx';
import PageError from 'src/components/common/PageError.jsx';
import PageLoading from 'src/components/common/PageLoading.jsx';
import Payment from 'src/components/common/Payment';
import PaymentStatus from 'src/components/common/PaymentStatus.jsx';
import RefundStatus from 'src/components/common/RefundStatus.jsx';
import store from 'src/store';
import colors from 'src/utils/colors';
import http from 'src/utils/http';
import theme from 'src/utils/theme';
import ui from 'src/utils/ui';

const frontPayMode = [
  'BALANCE',
  'WECHAT_APP',
  'ALIPAY_APP',
  'WECHAT_NATIVE',
  'ALIPAY_NATIVE',
];
const allFeeTypeList = [
  'RENT_FEE',
  'DAMAGE_DEPOSIT',
  'VIOLATION_DEPOSIT',
  'DELIVER_FEE',
  'RECEIVE_FEE',
  'OTHER',
];
const payModeLabel = {
  BALANCE: '余额',
  WECHAT_APP: '微信',
  ALIPAY_APP: '支付宝',
  WECHAT_NATIVE: '微信',
  ALIPAY_NATIVE: '支付宝',
};

export default class RefundDetailScreen extends React.Component {
  static navigationOptions = ({ navigation }) => {
    const { params = {} } = navigation.state;
    const titleByPageType = {
      ORDER_RENT_CANCEL: params.needReviewOrder ? '订单审核不通过' : '取消订单',
      DAMAGE_DEPOSIT_RETURN: '车损押金退还',
      VIOLATION_DEPOSIT_RETURN: '违章押金退还',
      SHOP_MANAGER_EXAMINING: '店长审核',
      CEO_EXAMINING: 'CEO审核',
      ACCOUNTANT_EXAMINING: '会计审核',
      CASHIER_REFUNDING: '出纳退款',
      RESTARTING: `「${store.getState().enums.refundType.map[
        params.refundType
      ] || '退款'}」再发起`,
      DETAIL: '查看退款详情',
    };
    let headerRight = <View />;

    return {
      title: titleByPageType[params.pageType],
      headerRight,
    };
  };

  constructor(props) {
    super(props);
    this.nav = this.props.navigation;
    this.navprops = this.nav.state.params || {};

    this.state = {
      cancelRemark: null,
      deliverRemark: null,
      shopManagerRemark: null,
      ceoRemark: null,
      accountantRemark: null,
      cashierRemark: null,

      feeTypeList: [],
      isPageCommitting: false,
      isPageReady: false,
      isPageError: false,
      originalRefundDetailList: [],

      isConfirmModalVisible: false,
      confirmModal: {
        title: '',
        btnText: '确认',
        hint: '',
        func: () => null,
        needToStartProcess: true,
        needLaunchWorkflow: true,
      },

      operatePaymentId: -1,

      deductionPaymentList: [],

      isDeductionPaymentModalVisible: false,
      deductionPaymentModalType: 'ADD',
      modalDeductionPayment: {},
    };
  }

  @autobind
  async loadRefund(refundId) {
    if (!refundId) {
      return;
    }

    try {
      const response = await http.get('/refund/getRefundById', {
        params: {
          refundId,
        },
      });
      const result = response.data;
      console.log('load refund:', result);
      if (!result.success) {
        throw result.message;
      }

      const refund = result.data.refundModel;
      this.nav.setParams({ refundType: refund.bean.type });
      this.setState({ refund }, () => this.initPaymentList(refund.paymentList));
    } catch (error) {
      console.log('load refund error:', error);
      ui.toastError(`加载退款详情失败：${error}`);
    }
  }

  @autobind
  async loadPaymentList(orderId) {
    try {
      const response = await http.get('/rentSelfDriving/getPaymentList', {
        params: {
          orderId,
        },
      });
      const result = response.data;
      console.log('load payment list', result);
      if (!result.success) {
        throw result.message;
      }

      return result.data.paymentList;
    } catch (error) {
      ui.toastError(`加载支付信息出错：${error}`);
      return [];
    }
  }

  @autobind
  initPaymentList(paymentList) {
    const paymentListMap = {
      ORDER_RENT_CANCEL: paymentList,
      DAMAGE_DEPOSIT_RETURN: paymentList.filter(
        payment => payment.feeType === 'DAMAGE_DEPOSIT',
      ),
      VIOLATION_DEPOSIT_RETURN: paymentList.filter(
        payment => payment.feeType === 'VIOLATION_DEPOSIT',
      ),
    };

    const refund = this.state.refund;
    const deductionPaymentList = [];
    const comparePaymentList =
      paymentListMap[refund.bean.type || this.navprops.pageType] || [];
    if (comparePaymentList.length > 0) {
      for (let payment of paymentList) {
        if (
          payment.parentPaymentId &&
          comparePaymentList.findIndex(p => p.id === payment.parentPaymentId) >
            -1
        ) {
          payment.flatListKey = 'payFee-' + deductionPaymentList.length + 1;
          deductionPaymentList.push(payment);
        }
      }
    }

    paymentList =
      paymentListMap[refund.bean.type || this.navprops.pageType] || [];

    let refundDetailList = [];
    if (refund.refundDetailList) {
      refundDetailList = refund.refundDetailList;
      for (let refundDetail of refundDetailList) {
        refundDetail.feeType = paymentList.find(
          payment => payment.id === refundDetail.paymentId,
        ).feeType;
      }
    } else {
      refundDetailList = paymentList.map(payment => ({
        paymentId: payment.id,
        feeType: payment.feeType,
        fee: payment.fee,
      }));
    }

    const feeTypeList = allFeeTypeList.filter(
      feeType =>
        paymentList.reduce((previousValue, payment) => {
          if (payment.feeType === feeType) {
            return previousValue + payment.fee;
          } else {
            return previousValue;
          }
        }, 0) > 0,
    );

    if (!refund.bean.type) {
      const paidOrderRentConsume = paymentList.reduce(
        (previousValue, payment) => previousValue + payment.fee,
        0,
      );
      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paidOrderRentConsume: { $set: paidOrderRentConsume },
          needReturnOrderRentConsume: { $set: paidOrderRentConsume },
        }),
      }));
    }

    this.setState(prevState => ({
      refund: update(prevState.refund, {
        paymentList: { $set: paymentList },
        refundDetailList: { $set: refundDetailList },
      }),
      deductionPaymentList,
      originalRefundDetailList: refundDetailList,
      feeTypeList,
      isPageReady: true,
    }));
  }

  @autobind
  go2paymentEditScreen({
    feeType,
    refundDetailId,
    remainToBePaidAmount,
    payment,
    type,
    direction,
    payMode = null,
  }) {
    let params = {};
    params.remainToBePaidAmount = remainToBePaidAmount;
    if (params.remainToBePaidAmount <= 0) {
      return;
    }

    if (!payment) {
      let paymentParam = {};
      paymentParam.feeType = feeType;
      paymentParam.direction = direction;
      paymentParam.orderId = this.state.refund.orderRent.id;
      paymentParam.refundDetailId = refundDetailId;
      paymentParam.payTime = new Date();
      paymentParam.payMode = payMode;
      paymentParam.fee = remainToBePaidAmount;
      paymentParam.userId = 0;
      paymentParam.name = null;
      paymentParam.remark = null;
      paymentParam.image = null;
      params.payment = paymentParam;
      params.pageType = 'ADD';
      params.onGoBack = payment =>
        refundDetailId
          ? this.addRefundPayment(payment)
          : this.addPayment(payment);
    } else {
      params.payment = payment;
      params.payment.payMode = payment.payMode;
      params.pageType = 'EDIT';
      params.onGoBack = payment => this.modifyPayment(payment);
    }

    if (
      type === 'ADD' &&
      direction === 'CUSTOMER_TO_WAGONS' &&
      (feeType === 'RENT_FEE' ||
        feeType === 'DELIVER_FEE' ||
        feeType === 'RECEIVE_FEE' ||
        feeType === 'OTHER') &&
      this.state.refund.balance > 0
    ) {
      params.payModeList = store
        .getState()
        .enums.payMode.list.filter(payMode => {
          return payMode.name !== 'POS_PRE_LICENSING';
        });
    } else {
      params.payModeList = store
        .getState()
        .enums.payMode.list.filter(payMode => {
          return (
            payMode.name !== 'BALANCE' && payMode.name !== 'POS_PRE_LICENSING'
          );
        });
    }

    params.type = type;
    params.canUseQrCode = false;
    this.props.navigation.navigate('PaymentEdit', params);
  }

  @autobind
  async addRefundPayment(payment) {
    this.setState({ isPageCommitting: true });
    try {
      payment.status = 'PAID_ARTIFICIAL';

      let request = {
        method: 'post',
        url: '/rentSelfDriving/addPayment',
        data: qs.stringify({
          paymentStr: JSON.stringify(payment),
          deductionPaymentListStr: JSON.stringify(
            this.state.deductionPaymentList,
          ),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('add refund payment', result);
      if (!result.success) {
        throw result.message;
      }

      ui.toastError(`添加退款信息成功！`);

      const paymentList = await this.loadPaymentList(
        this.state.refund.orderRent.id,
        this.state.refund.bean.type,
      );
      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paymentList: { $set: paymentList },
        }),
      }));
    } catch (error) {
      ui.toastError(`添加退款信息失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  noNeedToStartProcess() {
    const paymentList = this.state.refund.paymentList;
    const refundDetailList = this.state.refund.refundDetailList || [];
    return (
      refundDetailList.length === 0 ||
      refundDetailList.every(refundDetail => !refundDetail.fee) ||
      paymentList.every(payment => payment.payMode === 'POS_PRE_LICENSING')
    );
  }

  @autobind
  async reviewOrder(deliverSign) {
    this.setState({ isPageCommitting: false });
    try {
      let request = {
        method: 'post',
        url: '/rentSelfDriving/review',
        data: qs.stringify({
          taskId: this.navprops.taskId,
          orderRentStr: JSON.stringify(this.state.refund.orderRent),
          pass: false,
          deliverSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
          deductionPaymentListStr: JSON.stringify(
            this.state.deductionPaymentList,
          ),
          needLaunchWorkflow: this.state.confirmModal.needLaunchWorkflow,
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('review order', result);
      if (result.success) {
        ui.toastError(`订单审核不通过成功`);
        this.nav.pop(2);
      } else {
        ui.toastError(`订单审核不通过失败：${result.message}`);
      }
    } catch (error) {
      ui.toastError(`订单审核不通过失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  cancelOrder() {
    let rentFee = {
      paid: 0,
      refund: 0,
    };
    let depositFee = {
      paid: 0,
      refund: 0,
    };
    let deliverFee = {
      paid: 0,
      refund: 0,
    };
    let receiveFee = {
      paid: 0,
      refund: 0,
    };
    let otherFee = {
      paid: 0,
      refund: 0,
    };
    for (let refundDetail of this.state.refund.refundDetailList) {
      switch (refundDetail.feeType) {
        case 'RENT_FEE':
          rentFee.refund += refundDetail.fee;
          break;
        case 'DAMAGE_DEPOSIT':
        case 'VIOLATION_DEPOSIT':
          depositFee.refund += refundDetail.fee;
          break;
        case 'DELIVER_FEE':
          deliverFee.refund += refundDetail.fee;
          break;
        case 'RECEIVE_FEE':
          receiveFee.refund += refundDetail.fee;
          break;
        case 'OTHER':
          otherFee.refund += refundDetail.fee;
          break;
      }
    }

    for (let payment of this.state.refund.paymentList) {
      switch (payment.feeType) {
        case 'RENT_FEE':
          rentFee.paid += payment.fee;
          break;
        case 'DAMAGE_DEPOSIT':
        case 'VIOLATION_DEPOSIT':
          depositFee.paid += payment.fee;
          break;
        case 'DELIVER_FEE':
          deliverFee.paid += payment.fee;
          break;
        case 'RECEIVE_FEE':
          receiveFee.paid += payment.fee;
          break;
        case 'OTHER':
          otherFee.paid += payment.fee;
          break;
      }
    }

    let confirmInfo = this.navprops.needReviewOrder
      ? '确认退款明细：'
      : '确认取消后退款明细：';
    if (rentFee.paid > 0) {
      confirmInfo += '租金退款' + rentFee.refund;
    }
    if (depositFee.paid > 0) {
      confirmInfo += '；押金退款' + depositFee.refund;
    }
    if (deliverFee.paid > 0) {
      confirmInfo += '；送车费退款' + deliverFee.refund;
    }
    if (receiveFee.paid > 0) {
      confirmInfo += '；取车费退款' + receiveFee.refund;
    }
    if (otherFee.paid > 0) {
      confirmInfo += '；其他费用退款' + otherFee.refund;
    }

    this.setState(prevState => ({
      isConfirmModalVisible: true,
      confirmModal: update(prevState.confirmModal, {
        title: {
          $set: this.navprops.needReviewOrder ? '退款确认' : '取消后退款确认',
        },
        hint: { $set: confirmInfo },
        func: {
          $set: async () => {
            this.setState({ isConfirmModalVisible: false });
            // iOS下面，用setState回调函数会报原生错
            setTimeout(() => {
              if (this.state.confirmModal.needLaunchWorkflow) {
                this.nav.push('Signature', {
                  signatureType: 'REFUND',
                  onSaveSignature: deliverSign =>
                    this.cancelOrderByBackend(deliverSign),
                });
              } else {
                this.cancelOrderByBackend();
              }
            }, 0);
          },
        },
      }),
    }));
  }

  @autobind
  async cancelOrderByBackend(deliverSign) {
    if (this.navprops.needReviewOrder) {
      this.reviewOrder(deliverSign);
    } else {
      this.setState({ isPageCommitting: true });
      try {
        const response = await http.post(
          '/rentSelfDriving/cancel',
          qs.stringify({
            orderId: this.state.refund.orderRent.id,
            cancelRemark: this.state.cancelRemark,
            deliverSign,
            refundDetailListStr: JSON.stringify(
              this.state.refund.refundDetailList,
            ),
            deductionPaymentListStr: JSON.stringify(
              this.state.deductionPaymentList,
            ),
            needLaunchWorkflow: this.state.confirmModal.needLaunchWorkflow,
          }),
        );
        const result = response.data;

        if (result.success) {
          ui.toastError(`订单取消成功`);
          this.nav.goBack();
        } else {
          ui.toastError(`订单取消失败：${result.message}`);
        }
      } catch (error) {
        ui.toastError(`订单取消失败：${error}`);
      } finally {
        this.setState({ isPageCommitting: false });
      }
    }
  }

  @autobind
  handleDamageDeposit() {
    const refundDetailList = this.state.refund.refundDetailList || [];
    const refundFee = refundDetailList.reduce(
      (previousValue, refundDetail) => previousValue + refundDetail.fee,
      0,
    );

    const needToStartProcess = !this.noNeedToStartProcess();
    this.setState(prevState => ({
      isConfirmModalVisible: true,
      confirmModal: update(prevState.confirmModal, {
        title: { $set: '退款申请确认' },
        btnText: { $set: needToStartProcess ? '确认并签字' : '确认' },
        hint: { $set: `确认退款：车损押金${refundFee}元` },
        func: {
          $set: () => {
            this.setState({ isConfirmModalVisible: false });
            // iOS下面，用setState回调函数会报原生错
            setTimeout(() => {
              if (needToStartProcess) {
                this.nav.push('Signature', {
                  signatureType: 'REFUND',
                  onSaveSignature: deliverSign =>
                    this.submitDamageDepositRefund(deliverSign),
                });
              } else {
                this.submitDamageDepositRefund();
              }
            }, 0);
          },
        },
        needToStartProcess: { $set: needToStartProcess },
        needLaunchWorkflow: { $set: needToStartProcess },
      }),
    }));
  }

  @autobind
  async submitDamageDepositRefund(deliverSign = null) {
    this.setState({ isPageCommitting: true });
    try {
      let request = {
        method: 'post',
        url: '/rentSelfDriving/damageDeposit',
        data: qs.stringify({
          taskId: this.navprops.taskId,
          orderRentStr: JSON.stringify(this.state.refund.orderRent),
          deliverSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
          deductionPaymentListStr: JSON.stringify(
            this.state.deductionPaymentList,
          ),
          needLaunchWorkflow: this.state.confirmModal.needLaunchWorkflow,
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('handle damage deposit', result);

      if (result.success) {
        ui.toastError('提交车损押金退款成功');
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`提交车损押金退款失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  handleViolationDeposit() {
    const refundDetailList = this.state.refund.refundDetailList || [];
    const refundFee = refundDetailList.reduce(
      (previousValue, refundDetail) => previousValue + refundDetail.fee,
      0,
    );

    const needToStartProcess = !this.noNeedToStartProcess();
    this.setState(prevState => ({
      isConfirmModalVisible: true,
      confirmModal: update(prevState.confirmModal, {
        title: { $set: '退款申请确认' },
        btnText: { $set: needToStartProcess ? '确认并签字' : '确认' },
        hint: { $set: `确认退款：违章押金${refundFee}元` },
        func: {
          $set: () => {
            this.setState({ isConfirmModalVisible: false });
            // iOS下面，用setState回调函数会报原生错
            setTimeout(() => {
              if (needToStartProcess) {
                this.nav.push('Signature', {
                  signatureType: 'REFUND',
                  onSaveSignature: deliverSign =>
                    this.submitViolationDepositRefund(deliverSign),
                });
              } else {
                this.submitViolationDepositRefund();
              }
            }, 0);
          },
        },
        needToStartProcess: { $set: needToStartProcess },
        needLaunchWorkflow: { $set: needToStartProcess },
      }),
    }));
  }

  @autobind
  async submitViolationDepositRefund(deliverSign = null) {
    this.setState({ isPageCommitting: true });
    try {
      let request = {
        method: 'post',
        url: '/rentSelfDriving/violationDeposit',
        data: qs.stringify({
          taskId: this.navprops.taskId,
          orderRentId: this.state.refund.orderRent.id,
          deliverRemark: this.state.deliverRemark,
          deliverSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
          deductionPaymentListStr: JSON.stringify(
            this.state.deductionPaymentList,
          ),
          needLaunchWorkflow: this.state.confirmModal.needLaunchWorkflow,
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('handle violation deposit', result);

      if (result.success) {
        ui.toastError('提交违章押金退款成功');
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`提交违章押金退款失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  shopManagerExaminePassAndSign() {
    if (
      !deepCompare(
        this.state.originalRefundDetailList,
        this.state.refund.refundDetailList,
      )
    ) {
      for (
        let i = 0, len = this.state.refund.refundDetailList.length;
        i < len;
        i++
      ) {
        const refundDetail = this.state.refund.refundDetailList[i];
        const originalRefundDetail = this.state.originalRefundDetailList[i];
        if (
          refundDetail.fee !== originalRefundDetail.fee &&
          !refundDetail.shopManagerRemark
        ) {
          Alert.alert(
            '审核提示',
            '由于您修改了退款金额，请在该条退款记录下面补充完退款备注后再提交审核',
            [
              {
                text: '确认',
              },
            ],
            {
              cancelable: false,
            },
          );
          return;
        }
      }
    }

    this.nav.push('Signature', {
      signatureType: 'REFUND',
      onSaveSignature: shopManagerSign =>
        this.shopManagerExamineByBackService(true, shopManagerSign),
    });
  }

  @autobind
  async shopManagerExamineByBackService(passed, shopManagerSign = null) {
    if (
      !passed &&
      !this.state.shopManagerRemark &&
      this.state.refund.refundDetailList.every(
        refundDetail => !refundDetail.shopManagerRemark,
      )
    ) {
      Alert.alert(
        '提示',
        '驳回申请必须至少填入店长备注或退款备注',
        [{ text: '知道了' }],
        {
          cancelable: false,
        },
      );
      return;
    }

    this.setState({ isPageCommitting: true });
    try {
      const response = await http.post(
        '/refund/submitShopManagerExamine',
        qs.stringify({
          refundId: this.state.refund.bean.id,
          res: passed,
          remark: this.state.shopManagerRemark,
          shopManagerSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      );
      const result = response.data;

      if (result.success) {
        ui.toastError('退款审核成功');
        this.nav.goBack();
      } else if (result.message.indexOf('退款流程已被重新发起') > -1) {
        ui.toastError(result.message);
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`退款审核失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  ceoExaminePassAndSign() {
    if (
      !deepCompare(
        this.state.originalRefundDetailList,
        this.state.refund.refundDetailList,
      )
    ) {
      for (
        let i = 0, len = this.state.refund.refundDetailList.length;
        i < len;
        i++
      ) {
        const refundDetail = this.state.refund.refundDetailList[i];
        const originalRefundDetail = this.state.originalRefundDetailList[i];
        if (
          refundDetail.fee !== originalRefundDetail.fee &&
          !refundDetail.ceoRemark
        ) {
          Alert.alert(
            '审核提示',
            '由于您修改了退款金额，请在该条退款记录下面补充完退款备注后再提交审核',
            [
              {
                text: '确认',
              },
            ],
            {
              cancelable: false,
            },
          );
          return;
        }
      }
    }

    this.nav.push('Signature', {
      signatureType: 'REFUND',
      onSaveSignature: ceoSign => this.ceoExamineByBackService(true, ceoSign),
    });
  }

  @autobind
  async ceoExamineByBackService(passed, ceoSign = null) {
    if (
      !passed &&
      !this.state.ceoRemark &&
      this.state.refund.refundDetailList.every(
        refundDetail => !refundDetail.ceoRemark,
      )
    ) {
      Alert.alert(
        '提示',
        '驳回申请必须至少填入CEO备注或退款备注',
        [{ text: '知道了' }],
        {
          cancelable: false,
        },
      );
      return;
    }

    this.setState({ isPageCommitting: true });
    try {
      const response = await http.post(
        '/refund/submitCeoExamine',
        qs.stringify({
          refundId: this.state.refund.bean.id,
          res: passed,
          remark: this.state.ceoRemark,
          ceoSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      );
      const result = response.data;

      if (result.success) {
        ui.toastError(`退款${passed ? '审核' : '申请驳回'}成功`);
        this.nav.goBack();
      } else if (result.message.indexOf('退款流程已被重新发起') > -1) {
        ui.toastError(result.message);
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`退款${passed ? '审核' : '申请驳回'}成功：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  accountantManagerExaminePassAndSign() {
    if (
      this.state.refund.paymentList.some(
        payment =>
          payment.financialStatus === 'REJECTED' ||
          payment.financialStatus === 'TO_REVIEW' ||
          payment.financialStatus === 'TO_REVIEW_REJECTED',
      )
    ) {
      Alert.alert(
        '提示',
        '需退款项中包含待确认或已驳回款项，无法审核通过',
        [{ text: '知道了' }],
        {
          cancelable: false,
        },
      );
      return;
    }

    this.nav.push('Signature', {
      signatureType: 'REFUND',
      onSaveSignature: accountantSign =>
        this.accountantManagerExamineByBackService(true, accountantSign),
    });
  }

  @autobind
  async accountantManagerExamineByBackService(passed, accountantSign = null) {
    if (
      !passed &&
      !this.state.accountantRemark &&
      this.state.refund.refundDetailList.every(
        refundDetail => !refundDetail.accountantRemark,
      )
    ) {
      Alert.alert(
        '提示',
        '驳回申请必须至少填入会计备注或退款备注',
        [{ text: '知道了' }],
        {
          cancelable: false,
        },
      );
      return;
    }

    this.setState({ isPageCommitting: true });
    try {
      const response = await http.post(
        '/refund/submitAccountantExamine',
        qs.stringify({
          refundId: this.state.refund.bean.id,
          res: passed,
          remark: this.state.accountantRemark,
          accountantSign,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      );
      const result = response.data;

      if (result.success) {
        ui.toastError(`退款${passed ? '审核' : '申请驳回'}成功`);
        this.nav.goBack();
      } else if (result.message.indexOf('退款流程已被重新发起') > -1) {
        ui.toastError(result.message);
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`退款${passed ? '审核' : '申请驳回'}成功失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async cashierRefund() {
    this.setState({ isPageCommitting: true });
    const refundType = store
      .getState()
      .enums.refundType.map[this.state.refund.bean.type].replace('还', '款');
    try {
      const response = await http.post(
        '/refund/submitCashierRefund',
        qs.stringify({
          refundId: this.state.refund.bean.id,
          remark: this.state.cashierRemark,
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      );
      const result = response.data;

      if (result.success) {
        ui.toastError(`${refundType}成功`);
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`${refundType}失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async refundByBackServiceDirectly(refundDetail, payMode) {
    Alert.alert(
      '退款确认',
      `确认${payModeLabel[payMode]}退款${refundDetail.fee}元${
        store.getState().enums.feeType.map[refundDetail.feeType]
      }`,
      [
        {
          text: '取消',
        },
        {
          text: '确认',
          onPress: async () => {
            this.setState({ isPageCommitting: true });
            try {
              const urlMap = {
                BALANCE: '/refund/refundByBalance',
                WECHAT_APP: '/wxpay/refund',
                WECHAT_NATIVE: '/wxpay/refund',
                ALIPAY_APP: '/alipay/refund',
                ALIPAY_NATIVE: '/alipay/refund',
              };

              const response = await http.post(
                urlMap[payMode],
                qs.stringify({
                  refundDetailId: refundDetail.id,
                }),
              );
              const result = response.data;
              console.log('refund by back service directly', result);

              if (result.success) {
                ui.toastError(`${payModeLabel[payMode]}退款成功`);
                this.setState(prevState => ({
                  refund: update(prevState.refund, {
                    paymentList: { $push: [result.data.payment] },
                  }),
                }));
              } else {
                throw result.message;
              }
            } catch (error) {
              ui.toastError(`${payModeLabel[payMode]}退款失败：${error}`);
            } finally {
              this.setState({ isPageCommitting: false });
            }
          },
        },
      ],
      {
        cancelable: false,
      },
    );
  }

  @autobind
  async reloadPaymentDetail(paymentId) {
    try {
      const response = await http.get('/payment/getPaymentModelById', {
        params: {
          paymentId,
        },
      });
      const result = response.data;
      console.log('reload payment detail:', result);
      if (!result.success) {
        ui.toastError(`刷新款项详情失败：${result.message}`);
        return;
      }

      const index = this.state.refund.paymentList.findIndex(
        payment => payment.id === this.state.operatePaymentId,
      );
      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paymentList: {
            [index]: { $set: result.data.paymentModel.payment },
          },
        }),
        operatePaymentId: -1,
      }));
    } catch (error) {
      console.log('reload payment detail error:', error);
      ui.toastError(`刷新款项详情失败：${error}`);
    }
  }

  @autobind
  async preparePageData() {
    let paymentList = [];
    let refund = {};
    switch (this.navprops.pageType) {
      case 'ORDER_RENT_CANCEL':
      case 'DAMAGE_DEPOSIT_RETURN':
      case 'VIOLATION_DEPOSIT_RETURN':
        refund = this.navprops.order;
        refund.bean = {};
        refund.salesName = refund.makerName;
        refund.consumerName = refund.customerName;
        refund.consumerCell = refund.customerChiefCell;
        refund.paidDamageDeposit = refund.orderRent.paidDamageDeposit;
        refund.paidViolationDeposit = refund.orderRent.paidViolationDeposit;
        refund.needReturnDamageDeposit = refund.paidDamageDeposit;
        refund.needReturnViolationDeposit = refund.paidViolationDeposit;
        paymentList = await this.loadPaymentList(
          refund.orderRent.id,
          this.navprops.pageType,
        );
        await this.setState({ refund }, () =>
          this.initPaymentList(paymentList),
        );
        break;
      default:
        await this.loadRefund(this.navprops.refundId);
    }
  }

  @autobind
  calcAlreadyPaid(feeType) {
    return this.state.refund.paymentList
      .filter(
        payment =>
          payment.feeType === feeType &&
          (payment.direction === 'CUSTOMER_TO_WAGONS' ||
            payment.direction === 'PEER_TO_WAGONS'),
      )
      .reduce((previousValue, payment) => previousValue + payment.fee, 0);
  }

  @autobind
  async addPayment(payment) {
    try {
      payment.status = 'PAID_ARTIFICIAL';

      let request = {
        method: 'post',
        url: '/refund/addPayment',
        data: qs.stringify({
          paymentStr: JSON.stringify(payment),
          refundDetailStr: JSON.stringify({
            feeType: payment.feeType,
            fee: payment.fee,
            refundId: this.state.refund.bean.id,
          }),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('add payment', result);
      if (!result.success) {
        ui.toastError(`添加款项信息失败：${result.message}`);
        return;
      }

      ui.toastError(`添加款项信息成功！`);

      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paymentList: { $push: [result.data.payment] },
          refundDetailList: {
            $push: [
              {
                ...result.data.refundDetail,
                feeType: result.data.payment.feeType,
              },
            ],
          },
        }),
      }));
    } catch (error) {
      ui.toastError(`添加款项信息失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async modifyPayment(payment) {
    const refundDetail = this.state.refund.refundDetailList.find(
      refundDetail => refundDetail.paymentId === payment.id,
    );
    if (refundDetail.fee > payment.fee) {
      refundDetail.fee = payment.fee;
    }

    try {
      let request = {
        method: 'post',
        url: '/refund/modifyPayment',
        data: qs.stringify({
          paymentStr: JSON.stringify(payment),
          refundDetailStr: JSON.stringify(refundDetail),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('modify payment', result);
      if (!result.success) {
        ui.toastError(`修改款项信息失败：${result.message}`);
        return;
      }

      ui.toastError(`修改款项信息成功！`);

      const paymentIndex = this.state.refund.paymentList.findIndex(
        p => p.id === payment.id,
      );
      const refundDetailIndex = this.state.refund.refundDetailList.findIndex(
        refundDetail => refundDetail.paymentId === payment.id,
      );
      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paymentList: {
            [paymentIndex]: { $set: result.data.payment },
          },
          refundDetailList: {
            [refundDetailIndex]: {
              $set: {
                ...result.data.refundDetail,
                feeType: result.data.payment.feeType,
              },
            },
          },
        }),
      }));
    } catch (error) {
      ui.toastError(`修改款项信息失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async deletePayment(paymentId) {
    this.setState({ isPageCommitting: true });
    try {
      let request = {
        method: 'post',
        url: '/refund/deletePayment',
        data: qs.stringify({
          paymentId,
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('delete payment', result);
      if (!result.success) {
        ui.toastError(`删除款项信息失败：${result.message}`);
        return;
      }

      ui.toastError(`删除款项信息成功！`);

      const paymentIndex = this.state.refund.paymentList.findIndex(
        payment => payment.id === paymentId,
      );
      const refundDetailIndex = this.state.refund.refundDetailList.findIndex(
        refundDetail => refundDetail.paymentId === paymentId,
      );
      this.setState(prevState => ({
        refund: update(prevState.refund, {
          paymentList: { $splice: [[paymentIndex, 1]] },
          refundDetailList: { $splice: [[refundDetailIndex, 1]] },
        }),
      }));
    } catch (error) {
      ui.toastError(`删除款项信息失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  handleRestartRefund() {
    this.setState(prevState => ({
      isConfirmModalVisible: true,
      confirmModal: update(prevState.confirmModal, {
        title: { $set: '退款申请再发起确认' },
        btnText: { $set: '确认并签字' },
        hint: { $set: `确认再次发起退款申请？` },
        func: {
          $set: () => {
            this.setState({ isConfirmModalVisible: false });
            // iOS下面，用setState回调函数会报原生错，只能先这样了
            setTimeout(() => {
              this.nav.push('Signature', {
                signatureType: 'REFUND',
                onSaveSignature: deliverSign =>
                  this.submitRestartRefund(deliverSign),
              });
            }, 0);
          },
        },
        needToStartProcess: { $set: true },
        needLaunchWorkflow: { $set: true },
      }),
    }));
  }

  @autobind
  async submitRestartRefund(deliverSign = null) {
    this.setState({ isPageCommitting: true });
    try {
      let request = {
        method: 'post',
        url: '/refund/submitRestart',
        data: qs.stringify({
          refundId: this.state.refund.bean.id,
          deliverSign,
          orderRentStr: JSON.stringify(this.state.refund.orderRent),
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('restart refund', result);

      if (result.success) {
        ui.toastError('重新发起退款申请成功');
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`重新发起退款申请失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async modifyRefund() {
    this.setState({ isPageCommitting: true });
    try {
      let request = {
        method: 'post',
        url: '/refund/modifyRefundAndRefundDetailList',
        data: qs.stringify({
          refundStr: JSON.stringify(this.state.refund.bean),
          orderRentStr: JSON.stringify(this.state.refund.orderRent),
          refundDetailListStr: JSON.stringify(
            this.state.refund.refundDetailList,
          ),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('modify refund', result);

      if (result.success) {
        ui.toastError('暂存退款申请成功');
        this.nav.goBack();
      } else {
        throw result.message;
      }
    } catch (error) {
      ui.toastError(`暂存退款申请失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  saveDeductionPayment(payment, type) {
    this.setState({ isPageCommitting: true });
    const refundDetailIndex = payment.refundDetailIndex;

    try {
      const index = this.state.deductionPaymentList.findIndex(
        p => p.id === payment.id,
      );

      if (
        this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
        this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN' ||
        this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN'
      ) {
        if (type === 'ADD') {
          // 添加一条
          payment.flatListKey =
            'payFee-' + this.state.deductionPaymentList.length + 1;
          this.setState(prevState => ({
            deductionPaymentList: update(prevState.deductionPaymentList, {
              $push: [payment],
            }),
            refund: update(prevState.refund, {
              refundDetailList: {
                [refundDetailIndex]: {
                  fee: {
                    $set:
                      prevState.refund.refundDetailList[refundDetailIndex].fee -
                      payment.fee,
                  },
                },
              },
            }),
          }));
        } else {
          // 编辑一条
          payment.flatListKey = this.state.deductionPaymentList[
            index
          ].flatListKey;
          this.setState(prevState => ({
            deductionPaymentList: update(prevState.deductionPaymentList, {
              $splice: [[index, 1, payment]],
            }),
            refund: update(prevState.refund, {
              refundDetailList: {
                [refundDetailIndex]: {
                  fee: {
                    $set:
                      prevState.refund.refundDetailList[refundDetailIndex].fee -
                      payment.fee +
                      payment.feeBefore,
                  },
                },
              },
            }),
          }));
        }
      } else {
        // 非新建页面直接提交到后台即可
        if (!payment.id) {
          this.addDeductionPayment(payment);
        } else {
          this.modifyDeductionPayment(payment);
        }
      }
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async addDeductionPayment(payment) {
    const refundDetailIndex = payment.refundDetailIndex;
    const refundDetail = this.state.refund.refundDetailList[refundDetailIndex];
    try {
      let request = {
        method: 'post',
        url: '/refund/addDeductionPayment',
        data: qs.stringify({
          deductionPaymentStr: JSON.stringify(payment),
          refundDetailStr: JSON.stringify({
            ...refundDetail,
            fee: refundDetail.fee - payment.fee,
          }),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('add deduction payment', result);
      if (!result.success) {
        ui.toastError(`添加扣除费用失败：${result.message}`);
        return;
      }

      ui.toastError(`添加扣除费用成功！`);

      this.setState(prevState => ({
        deductionPaymentList: update(prevState.deductionPaymentList, {
          $push: [result.data.deductionPayment],
        }),
        refund: update(prevState.refund, {
          refundDetailList: {
            [refundDetailIndex]: { $set: result.data.refundDetail },
          },
        }),
      }));
    } catch (error) {
      ui.toastError(`添加扣除费用失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async modifyDeductionPayment(payment) {
    const refundDetailIndex = payment.refundDetailIndex;
    const refundDetail = this.state.refund.refundDetailList[refundDetailIndex];
    try {
      let request = {
        method: 'post',
        url: '/refund/modifyDeductionPayment',
        data: qs.stringify({
          deductionPaymentStr: JSON.stringify(payment),
          refundDetailStr: JSON.stringify({
            ...refundDetail,
            fee: refundDetail.fee - payment.fee + payment.feeBefore,
          }),
        }),
      };

      const response = await http.request(request);
      const result = response.data;
      console.log('modify deduction payment', result);
      if (!result.success) {
        ui.toastError(`修改扣除费用失败：${result.message}`);
        return;
      }

      ui.toastError(`修改扣除费用成功！`);

      const paymentIndex = this.state.deductionPaymentList.findIndex(
        p => p.id === payment.id,
      );
      this.setState(prevState => ({
        deductionPaymentList: update(prevState.deductionPaymentList, {
          [paymentIndex]: { $set: result.data.deductionPayment },
        }),
        refund: update(prevState.refund, {
          refundDetailList: {
            [refundDetailIndex]: { $set: result.data.refundDetail },
          },
        }),
      }));
    } catch (error) {
      ui.toastError(`修改扣除费用失败：${error}`);
    } finally {
      this.setState({ isPageCommitting: false });
    }
  }

  @autobind
  async deleteDeductionPayment(payment) {
    const index = this.state.deductionPaymentList.findIndex(
      p => p.id === payment.id,
    );
    const refundDetailIndex = payment.refundDetailIndex;
    const refundDetail = this.state.refund.refundDetailList[refundDetailIndex];

    if (
      this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
      this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN' ||
      this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN'
    ) {
      this.setState(prevState => {
        let deductionPaymentList = update(prevState.deductionPaymentList, {
          $splice: [[index, 1]],
        });

        for (let i = 0; i < deductionPaymentList.length; i++) {
          let payment = deductionPaymentList[i];
          payment.flatListKey = 'payFee-' + i + 1;
        }

        return {
          deductionPaymentList,
          isPageCommitting: false,
          refund: update(prevState.refund, {
            refundDetailList: {
              [refundDetailIndex]: {
                fee: {
                  $set:
                    prevState.refund.refundDetailList[refundDetailIndex].fee +
                    payment.fee,
                },
              },
            },
          }),
        };
      });
    } else {
      try {
        let request = {
          method: 'post',
          url: '/refund/deleteDeductionPayment',
          data: qs.stringify({
            deductionPaymentId: payment.id,
            refundDetailStr: JSON.stringify({
              ...refundDetail,
              fee: refundDetail.fee + payment.fee,
            }),
          }),
        };

        const response = await http.request(request);
        const result = response.data;
        console.log('delete deduction payment', result);
        if (!result.success) {
          ui.toastError(`删除扣除费用失败：${result.message}`);
          return;
        }

        ui.toastError(`删除扣除费用成功！`);

        this.setState(prevState => ({
          deductionPaymentList: update(prevState.deductionPaymentList, {
            $splice: [[index, 1]],
          }),
          refund: update(prevState.refund, {
            refundDetailList: {
              [refundDetailIndex]: { $set: result.data.refundDetail },
            },
          }),
        }));
      } catch (error) {
        ui.toastError(`删除扣除费用失败：${error}`);
      } finally {
        this.setState({ isPageCommitting: false });
      }
    }
  }

  componentDidMount() {
    this.preparePageData();

    this.routeSubscribe = this.props.navigation.addListener('didFocus', () => {
      if (this.state.operatePaymentId !== -1) {
        this.reloadPaymentDetail(this.state.operatePaymentId);
      }
    });
  }

  componentWillUnmount() {
    this.routeSubscribe.remove();
  }

  render() {
    if (!this.state.isPageReady) {
      return <PageLoading />;
    }

    if (this.state.isPageReady && this.state.isPageError) {
      return <PageError onRefresh={() => this.preparePageData()} />;
    } else {
      const refund = this.state.refund;
      const vehicleName =
        refund.vehicleName +
        '【' +
        refund.vehicleColor +
        '】' +
        (refund.vehiclePlateNumber || '--');
      const status = refund.bean.status;
      const type = refund.bean.type;
      const splitStyle = {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 5,
      };
      const confirmBtnMap = {
        DAMAGE_DEPOSIT_RETURN: {
          label: '提交车损押金退还',
          func: this.handleDamageDeposit,
        },
        VIOLATION_DEPOSIT_RETURN: {
          label: '提交违章押金退还',
          func: this.handleViolationDeposit,
        },
        SHOP_MANAGER_EXAMINING: {
          label: {
            pass: '店长审核完成',
            unpass: '退款申请驳回',
          },
          func: {
            pass: () => this.shopManagerExaminePassAndSign(),
            unpass: () =>
              Alert.alert(
                '提示',
                '确认驳回该退款申请？',
                [
                  {
                    text: '取消',
                  },
                  {
                    text: '确定',
                    onPress: () => this.shopManagerExamineByBackService(false),
                  },
                ],
                {
                  cancelable: false,
                },
              ),
          },
        },
        CEO_EXAMINING: {
          label: {
            pass: 'CEO审核完成',
            unpass: '退款申请驳回',
          },
          func: {
            pass: () => this.ceoExaminePassAndSign(),
            unpass: () =>
              Alert.alert(
                '提示',
                '确认驳回该退款申请？',
                [
                  {
                    text: '取消',
                  },
                  {
                    text: '确定',
                    onPress: () => this.ceoExamineByBackService(false),
                  },
                ],
                {
                  cancelable: false,
                },
              ),
          },
        },
        ACCOUNTANT_EXAMINING: {
          label: {
            pass: '会计审核完成',
            unpass: '退款申请驳回',
          },
          func: {
            pass: () => this.accountantManagerExaminePassAndSign(),
            unpass: () =>
              Alert.alert(
                '提示',
                '确认驳回该退款申请？',
                [
                  {
                    text: '取消',
                  },
                  {
                    text: '确定',
                    onPress: () =>
                      this.accountantManagerExamineByBackService(false),
                  },
                ],
                {
                  cancelable: false,
                },
              ),
          },
        },
        CASHIER_REFUNDING: {
          label: '出纳退款完成',
          func: this.cashierRefund,
        },
      };
      const isVehicleDamageEditable =
        this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN';

      let unRefundFeeMap = {};
      for (let feeType of allFeeTypeList) {
        unRefundFeeMap[feeType] = this.state.refund.refundDetailList
          .filter(refundDetail => refundDetail.feeType === feeType)
          .reduce((previousValueOut, refundDetail) => {
            if (refundDetail.fee == null) {
              return previousValueOut;
            } else {
              return (
                previousValueOut +
                refundDetail.fee -
                this.state.refund.paymentList.reduce(
                  (previousValueInner, payment) => {
                    if (payment.refundDetailId === refundDetail.id) {
                      return previousValueInner + payment.fee;
                    } else {
                      return previousValueInner;
                    }
                  },
                  0,
                )
              );
            }
          }, 0);
      }

      const paymentByFeeTypeMap = {
        RENT_FEE: {
          fieldInOrderRent: 'rentFee',
          remainToBePaidAmount:
            refund.orderRent.rentFee - this.calcAlreadyPaid('RENT_FEE'),
        },
        DAMAGE_DEPOSIT: {
          fieldInOrderRent: 'damageDeposit',
          remainToBePaidAmount:
            refund.orderRent.damageDeposit -
            this.calcAlreadyPaid('DAMAGE_DEPOSIT'),
        },
        VIOLATION_DEPOSIT: {
          fieldInOrderRent: 'violationDeposit',
          remainToBePaidAmount:
            refund.orderRent.violationDeposit -
            this.calcAlreadyPaid('VIOLATION_DEPOSIT'),
        },
        DELIVER_FEE: {
          fieldInOrderRent: 'vehicleDeliverFee',
          remainToBePaidAmount:
            refund.orderRent.vehicleDeliverFee -
            this.calcAlreadyPaid('DELIVER_FEE'),
        },
        RECEIVE_FEE: {
          fieldInOrderRent: 'vehicleReceiveFee',
          remainToBePaidAmount:
            refund.orderRent.vehicleReceiveFee -
            this.calcAlreadyPaid('RECEIVE_FEE'),
        },
      };

      let feeTypeList = store
        .getState()
        .enums.feeType.list.filter(
          feeType =>
            feeType.name === 'RENT_FEE' ||
            feeType.name === 'DELIVER_FEE' ||
            feeType.name === 'RECEIVE_FEE' ||
            feeType.name === 'OIL_FEE' ||
            feeType.name === 'OVER_TIME_FEE' ||
            feeType.name === 'OVER_KM_FEE' ||
            feeType.name === 'SERVICE_FEE' ||
            feeType.name === 'OTHER',
        );
      if (
        this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN' ||
        type === 'VIOLATION_DEPOSIT_RETURN'
      ) {
        feeTypeList = feeTypeList.concat(
          store
            .getState()
            .enums.feeType.list.filter(
              feeType => feeType.name === 'VIOLATION_FEE',
            ),
        );
      }
      if (
        this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN' ||
        type === 'DAMAGE_DEPOSIT_RETURN'
      ) {
        feeTypeList = feeTypeList.concat(
          store
            .getState()
            .enums.feeType.list.filter(
              feeType => feeType.name === 'DAMAGE_FEE',
            ),
        );
      }
      if (
        this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
        type === 'ORDER_RENT_CANCEL'
      ) {
        feeTypeList = store
          .getState()
          .enums.feeType.list.filter(
            feeType => feeType.name === 'PENALTY' || feeType.name === 'OTHER',
          );
      }
      let defaultFeeTypeIndex = -1;
      for (let i = 0; i < feeTypeList.length; i++) {
        if (this.state.modalDeductionPayment.feeType === feeTypeList[i].name) {
          defaultFeeTypeIndex = i;
          break;
        }
      }

      return (
        <View style={{ flex: 1 }}>
          <KeyboardAwareScrollView
            style={{
              flex: 1,
            }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            <View
              style={{
                marginTop: 10,
                marginHorizontal: 10,
                padding: 10,
                backgroundColor: 'white',
                borderRadius: 2,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{ flexDirection: 'row', justifyContent: 'flex-start' }}
                >
                  <Text
                    style={{
                      marginLeft: -10,
                      fontSize: 16,
                      fontWeight: '700',
                      color: colors.textDarkGray,
                    }}
                  >
                    【
                    {
                      store.getState().enums.refundType.map[
                        refund.bean.type || this.navprops.pageType
                      ]
                    }
                    】
                  </Text>
                  <Text
                    style={{
                      marginLeft: -5,
                      color: colors.textGray,
                    }}
                  >
                    {refund.orderRent.id}
                  </Text>
                </View>
                <View style={{ flex: 1 }} />
                {this.navprops.pageType !== 'DAMAGE_DEPOSIT_RETURN' &&
                  this.navprops.pageType !== 'VIOLATION_DEPOSIT_RETURN' && (
                    <View
                      style={{
                        backgroundColor: 'purple',
                        marginRight: 5,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 3,
                      }}
                    >
                      <Text style={{ color: 'white' }}>
                        {this.navprops.pageType === 'ORDER_RENT_CANCEL'
                          ? store.getState().enums.orderRentStatus.map[
                              refund.orderRent.status
                            ]
                          : store.getState().enums.refundStatus.map[status]}
                      </Text>
                    </View>
                  )}
                <View
                  style={{
                    height: 20,
                    width: 20,
                    borderRadius: 50,
                    backgroundColor:
                      refund.orderRent.type === 'DRIVING_SELF'
                        ? 'orange'
                        : 'green',
                  }}
                />
              </View>
              <View style={splitStyle}>
                <Text>{refund.consumerName}</Text>
                <CustomerCellField
                  cell={refund.consumerCell}
                  cellList={refund.customerCellList}
                  customerName={refund.consumerName}
                />
              </View>
              <View style={splitStyle}>
                <Text>
                  {store.getState().cities.map[refund.orderRent.cityId].name}
                </Text>
                <Text>{vehicleName}</Text>
              </View>
              <View style={theme.styles.orderRow}>
                <Text style={theme.styles.orderRowTitle}>用车开始</Text>
                <Text>
                  {refund.orderRent.vehicleDeliverTime == null
                    ? ''
                    : moment(refund.orderRent.vehicleDeliverTime).format(
                        'YYYY-MM-DD HH:mm',
                      )}
                </Text>
                <Text>
                  【{refund.orderRent.vehicleUsedDays}
                  天】
                </Text>
              </View>
              <View style={theme.styles.orderRow}>
                <Text style={theme.styles.orderRowTitle}>用车结束</Text>
                <Text
                  style={{
                    color:
                      (this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN' ||
                        type === 'VIOLATION_DEPOSIT_RETURN') &&
                      moment().diff(
                        moment(refund.orderRent.vehicleReceiveTime),
                        'day',
                      ) <= 14
                        ? 'orange'
                        : 'black',
                  }}
                >
                  {refund.orderRent.vehicleReceiveTime == null
                    ? ''
                    : moment(refund.orderRent.vehicleReceiveTime).format(
                        'YYYY-MM-DD HH:mm',
                      )}
                </Text>
              </View>
              {type === 'ORDER_RENT_CANCEL' && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>用车消费</Text>
                  <RefundStatus
                    paid={refund.paidOrderRentConsume}
                    showNeedToReturn={!!type}
                    needToReturn={refund.needReturnOrderRentConsume}
                    cashierReturn={refund.cashierNeedReturnOrderRentConsume}
                    showCashierReturn={
                      (status === 'ACCOUNTANT_EXAMINING' ||
                        status === 'CASHIER_REFUNDING' ||
                        status === 'FINISH') &&
                      refund.needReturnOrderRentConsume !==
                        refund.cashierNeedReturnOrderRentConsume
                    }
                    showUnReturn={status === 'CASHIER_REFUNDING'}
                    unReturn={
                      unRefundFeeMap['RENT_FEE'] +
                      unRefundFeeMap['DELIVER_FEE'] +
                      unRefundFeeMap['RECEIVE_FEE'] +
                      unRefundFeeMap['OTHER']
                    }
                  />
                </View>
              )}

              {refund.orderRent.type === 'DRIVING_SELF' && (
                <React.Fragment>
                  {(type === 'DAMAGE_DEPOSIT_RETURN' ||
                    type === 'ORDER_RENT_CANCEL' ||
                    this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
                    this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN') && (
                    <View style={theme.styles.orderRow}>
                      <Text style={theme.styles.orderRowTitle}>车损押金</Text>
                      {this.navprops.pageType === 'RESTARTING' ? (
                        <React.Fragment>
                          <Text>{refund.orderRent.damageDeposit}</Text>
                          <PaymentStatus
                            needToPay={refund.orderRent.damageDeposit}
                            unpaid={
                              paymentByFeeTypeMap['DAMAGE_DEPOSIT']
                                .remainToBePaidAmount
                            }
                          />
                        </React.Fragment>
                      ) : (
                        <RefundStatus
                          paid={refund.paidDamageDeposit}
                          showNeedToReturn={!!type}
                          needToReturn={refund.needReturnDamageDeposit}
                          cashierReturn={refund.cashierNeedReturnDamageDeposit}
                          showCashierReturn={
                            (status === 'ACCOUNTANT_EXAMINING' ||
                              status === 'CASHIER_REFUNDING' ||
                              status === 'FINISH') &&
                            refund.needReturnDamageDeposit !==
                              refund.cashierNeedReturnDamageDeposit
                          }
                          showUnReturn={status === 'CASHIER_REFUNDING'}
                          unReturn={unRefundFeeMap['DAMAGE_DEPOSIT']}
                        />
                      )}
                    </View>
                  )}

                  {(type === 'VIOLATION_DEPOSIT_RETURN' ||
                    type === 'ORDER_RENT_CANCEL' ||
                    this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
                    this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN') && (
                    <View style={theme.styles.orderRow}>
                      <Text style={theme.styles.orderRowTitle}>违章押金</Text>
                      {this.navprops.pageType === 'RESTARTING' ? (
                        <React.Fragment>
                          <Text>{refund.orderRent.violationDeposit}</Text>
                          <PaymentStatus
                            needToPay={refund.orderRent.violationDeposit}
                            unpaid={
                              paymentByFeeTypeMap['VIOLATION_DEPOSIT']
                                .remainToBePaidAmount
                            }
                          />
                        </React.Fragment>
                      ) : (
                        <RefundStatus
                          paid={refund.paidViolationDeposit}
                          showNeedToReturn={!!type}
                          needToReturn={refund.needReturnViolationDeposit}
                          cashierReturn={
                            refund.cashierNeedReturnViolationDeposit
                          }
                          showCashierReturn={
                            (status === 'ACCOUNTANT_EXAMINING' ||
                              status === 'CASHIER_REFUNDING' ||
                              status === 'FINISH') &&
                            refund.needReturnViolationDeposit !==
                              refund.cashierNeedReturnViolationDeposit
                          }
                          showUnReturn={status === 'CASHIER_REFUNDING'}
                          unReturn={unRefundFeeMap['VIOLATION_DEPOSIT']}
                        />
                      )}
                    </View>
                  )}
                </React.Fragment>
              )}

              {refund.salesName !== refund.followerName ? (
                <React.Fragment>
                  <View style={theme.styles.orderRow}>
                    <Text style={theme.styles.orderRowTitle}>成单人</Text>
                    <Text>{refund.salesName}</Text>
                  </View>
                  <View style={theme.styles.orderRow}>
                    <Text style={theme.styles.orderRowTitle}>跟单人</Text>
                    <Text>{refund.followerName}</Text>
                  </View>
                </React.Fragment>
              ) : (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>成单人</Text>
                  <Text>{refund.salesName}</Text>
                </View>
              )}
              <View style={theme.styles.orderRow}>
                <Text style={theme.styles.orderRowTitle}>成单时间</Text>
                <Text>
                  {moment(refund.orderRent.createdAt).format(
                    'YYYY-MM-DD HH:mm',
                  )}
                </Text>
              </View>

              {type === 'ORDER_RENT_CANCEL' && (
                <React.Fragment>
                  <View style={theme.styles.orderRow}>
                    <Text style={theme.styles.orderRowTitle}>取消人</Text>
                    <Text>{refund.creatorName}</Text>
                  </View>

                  <View style={theme.styles.orderRow}>
                    <Text style={theme.styles.orderRowTitle}>取消时间</Text>
                    <Text>
                      {moment(refund.bean.createdAt).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  </View>
                </React.Fragment>
              )}

              {(type === 'VIOLATION_DEPOSIT_RETURN' ||
                this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN') && (
                <React.Fragment>
                  <View style={theme.styles.orderRow}>
                    <Text style={theme.styles.orderRowTitle}>有无违章</Text>
                    <Text>{refund.orderRent.violationExist ? '有' : '无'}</Text>
                  </View>

                  {refund.orderRent.violationExist && (
                    <View style={theme.styles.orderRow}>
                      <Text style={theme.styles.orderRowTitle}>违章详情</Text>
                      <Text style={{ flex: 1 }}>
                        {refund.orderRent.violationDetail}
                      </Text>
                    </View>
                  )}
                </React.Fragment>
              )}

              {type === 'ORDER_RENT_CANCEL' && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>取消备注</Text>
                  <Text style={{ flex: 1 }}>
                    {refund.orderRent.cancelRemark}
                  </Text>
                </View>
              )}

              {type === 'VIOLATION_DEPOSIT_RETURN' && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>退还备注</Text>
                  <Text style={{ flex: 1 }}>{refund.deliverRemark}</Text>
                </View>
              )}

              {(status === 'CEO_EXAMINING' ||
                status === 'ACCOUNTANT_EXAMINING' ||
                status === 'CASHIER_REFUNDING' ||
                status === 'FINISH' ||
                (status === 'RESTARTING' &&
                  !!refund.bean.shopManagerRemark)) && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>店长备注</Text>
                  <Text style={{ flex: 1 }}>
                    {!refund.bean.shopManagerRemark && '无'}
                    {store.getState().users.map[refund.bean.shopManagerId] && (
                      <Text>
                        【
                        {
                          store.getState().users.map[refund.bean.shopManagerId]
                            .name
                        }
                        】
                      </Text>
                    )}
                    {refund.bean.shopManagerRemark}
                  </Text>
                </View>
              )}

              {(status === 'CEO_EXAMINING' ||
                status === 'CASHIER_REFUNDING' ||
                status === 'FINISH' ||
                (status === 'RESTARTING' &&
                  !!refund.bean.accountantRemark)) && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>会计备注</Text>
                  <Text style={{ flex: 1 }}>
                    {refund.bean.accountantRemark}
                  </Text>
                </View>
              )}

              {(status === 'CASHIER_REFUNDING' ||
                status === 'FINISH' ||
                (status === 'RESTARTING' && !!refund.bean.ceoRemark)) && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>CEO备注</Text>
                  <Text style={{ flex: 1 }}>
                    {!refund.bean.ceoRemark && '无'}
                    {store.getState().users.map[refund.bean.ceoId] && (
                      <Text>
                        【{store.getState().users.map[refund.bean.ceoId].name}】
                      </Text>
                    )}
                    {refund.bean.ceoRemark}
                  </Text>
                </View>
              )}

              {status === 'FINISH' && (
                <View style={theme.styles.orderRow}>
                  <Text style={theme.styles.orderRowTitle}>出纳备注</Text>
                  <Text style={{ flex: 1 }}>{refund.bean.cashierRemark}</Text>
                </View>
              )}

              <View
                style={{
                  paddingVertical: 3,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    this.nav.push('OrderRentAllPayments', {
                      refund,
                      showReviewLink:
                        this.navprops.pageType === 'ACCOUNTANT_EXAMINING' ||
                        this.navprops.pageType === 'CASHIER_REFUNDING',
                      onGoBack: () => this.loadRefund(this.navprops.refundId),
                    });
                  }}
                  style={{ marginTop: 5 }}
                >
                  <Text style={{ color: colors.primary, marginLeft: 5 }}>
                    {'查看订单全部款项 >'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {this.navprops.pageType === 'ORDER_RENT_CANCEL' &&
              !this.navprops.needReviewOrder && (
                <View
                  style={{
                    marginTop: 10,
                    marginHorizontal: 10,
                    padding: 10,
                    backgroundColor: 'white',
                    borderRadius: 2,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        width: 4,
                        borderRadius: 50,
                        backgroundColor: colors.primary,
                      }}
                    />

                    <Text
                      style={{
                        marginLeft: 10,
                        fontSize: 15,
                        color: colors.textDarkGray,
                        fontWeight: 'bold',
                      }}
                    >
                      取消备注：
                    </Text>
                  </View>

                  <TextInput
                    placeholderTextColor="lightgray"
                    multiline
                    value={this.state.cancelRemark}
                    onChangeText={remark =>
                      this.setState({
                        cancelRemark: remark.length === 0 ? null : remark,
                      })
                    }
                    style={{
                      flex: 1,
                      height: 80,
                      marginVertical: 5,
                      padding: 5,
                      lineHeight: 21,
                      textAlignVertical: 'top',
                      color: colors.textDarkGray,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </View>
              )}

            {this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN' && (
              <View
                style={{
                  marginTop: 10,
                  marginHorizontal: 10,
                  padding: 10,
                  backgroundColor: 'white',
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 50,
                      backgroundColor: colors.primary,
                    }}
                  />

                  <Text
                    style={{
                      marginLeft: 10,
                      fontSize: 15,
                      color: colors.textDarkGray,
                      fontWeight: 'bold',
                    }}
                  >
                    退还备注：
                  </Text>
                </View>

                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={this.state.deliverRemark}
                  onChangeText={remark =>
                    this.setState({
                      deliverRemark: remark.length === 0 ? null : remark,
                    })
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            )}

            {this.navprops.pageType === 'SHOP_MANAGER_EXAMINING' && (
              <View
                style={{
                  marginTop: 10,
                  marginHorizontal: 10,
                  padding: 10,
                  backgroundColor: 'white',
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 50,
                      backgroundColor: colors.primary,
                    }}
                  />

                  <Text
                    style={{
                      marginLeft: 10,
                      fontSize: 15,
                      color: colors.textDarkGray,
                      fontWeight: 'bold',
                    }}
                  >
                    店长备注：
                  </Text>
                </View>

                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={this.state.shopManagerRemark}
                  onChangeText={remark =>
                    this.setState({
                      shopManagerRemark: remark.length === 0 ? null : remark,
                    })
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            )}

            {this.navprops.pageType === 'ACCOUNTANT_EXAMINING' && (
              <View
                style={{
                  marginTop: 10,
                  marginHorizontal: 10,
                  padding: 10,
                  backgroundColor: 'white',
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 50,
                      backgroundColor: colors.primary,
                    }}
                  />

                  <Text
                    style={{
                      marginLeft: 10,
                      fontSize: 15,
                      color: colors.textDarkGray,
                      fontWeight: 'bold',
                    }}
                  >
                    会计备注：
                  </Text>
                </View>

                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={this.state.accountantRemark}
                  onChangeText={remark =>
                    this.setState({
                      accountantRemark: remark.length === 0 ? null : remark,
                    })
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            )}

            {this.navprops.pageType === 'CEO_EXAMINING' && (
              <View
                style={{
                  marginTop: 10,
                  marginHorizontal: 10,
                  padding: 10,
                  backgroundColor: 'white',
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 50,
                      backgroundColor: colors.primary,
                    }}
                  />

                  <Text
                    style={{
                      marginLeft: 10,
                      fontSize: 15,
                      color: colors.textDarkGray,
                      fontWeight: 'bold',
                    }}
                  >
                    CEO备注：
                  </Text>
                </View>

                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={this.state.ceoRemark}
                  onChangeText={remark =>
                    this.setState({
                      ceoRemark: remark.length === 0 ? null : remark,
                    })
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            )}

            {this.navprops.pageType === 'CASHIER_REFUNDING' && (
              <View
                style={{
                  marginTop: 10,
                  marginHorizontal: 10,
                  padding: 10,
                  backgroundColor: 'white',
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 50,
                      backgroundColor: colors.primary,
                    }}
                  />

                  <Text
                    style={{
                      marginLeft: 10,
                      fontSize: 15,
                      color: colors.textDarkGray,
                      fontWeight: 'bold',
                    }}
                  >
                    出纳备注：
                  </Text>
                </View>

                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={this.state.cashierRemark}
                  onChangeText={remark =>
                    this.setState({
                      cashierRemark: remark.length === 0 ? null : remark,
                    })
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            )}

            {this.state.feeTypeList.map(feeType => (
              <React.Fragment key={feeType}>
                <SectionHeader
                  title={store.getState().enums.feeType.map[feeType]}
                  style={{ height: 40 }}
                />

                <View
                  style={{
                    marginHorizontal: 10,
                    padding: 10,
                    backgroundColor: 'white',
                    borderRadius: 2,
                  }}
                >
                  {this.navprops.pageType === 'RESTARTING' &&
                    feeType !== 'OTHER' && (
                      <React.Fragment>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <View
                            style={{
                              flex: 2,
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                color: colors.textDarkGray,
                                fontWeight: 'bold',
                              }}
                            >
                              {store.getState().enums.feeType.map[feeType]}
                              应付总额：
                            </Text>
                            <MyTextInput
                              keyboardType="numeric"
                              value={`${
                                refund.orderRent[
                                  paymentByFeeTypeMap[feeType].fieldInOrderRent
                                ] == null
                                  ? ''
                                  : refund.orderRent[
                                      paymentByFeeTypeMap[feeType]
                                        .fieldInOrderRent
                                    ]
                              }`}
                              onChangeText={input => {
                                this.setState(prevState => ({
                                  refund: update(prevState.refund, {
                                    orderRent: {
                                      [paymentByFeeTypeMap[feeType]
                                        .fieldInOrderRent]: {
                                        $set:
                                          isNaN(parseFloat(input)) ||
                                          parseFloat(input) < 0
                                            ? null
                                            : parseFloat(input),
                                      },
                                    },
                                  }),
                                }));
                              }}
                              style={{
                                height: 27,
                                flex: 1,
                                marginRight: 5,
                                paddingHorizontal: 5, // iOS 下默认没有左 padding,
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: 0,
                              }}
                            />
                          </View>

                          <Text
                            style={{
                              flex: 1,
                              marginLeft: 5,
                              color:
                                paymentByFeeTypeMap[feeType]
                                  .remainToBePaidAmount !== 0
                                  ? 'red'
                                  : colors.textDarkGray,
                              fontSize: 12,
                              textAlign: 'right',
                            }}
                          >
                            {'未付 ' +
                              paymentByFeeTypeMap[feeType].remainToBePaidAmount}
                          </Text>
                        </View>

                        <View
                          style={{
                            height: 0.5,
                            marginVertical: 10,
                            backgroundColor: '#e5e5e5',
                          }}
                        />
                      </React.Fragment>
                    )}

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: colors.textDarkGray,
                        fontWeight: 'bold',
                      }}
                    >
                      {store.getState().enums.feeType.map[feeType]}
                      应退：
                    </Text>

                    <Text
                      style={{
                        fontSize: 15,
                        color: '#535353',
                      }}
                    >
                      总计￥
                      {refund.refundDetailList.reduce(
                        (previousValue, refundDetail) => {
                          if (refundDetail.feeType === feeType) {
                            return previousValue + refundDetail.fee;
                          } else {
                            return previousValue;
                          }
                        },
                        0,
                      )}
                    </Text>
                  </View>
                </View>

                {refund.paymentList
                  .filter(
                    payment =>
                      !payment.parentPaymentId &&
                      payment.feeType === feeType &&
                      (payment.direction === 'CUSTOMER_TO_WAGONS' ||
                        payment.direction === 'PEER_TO_WAGONS'),
                  )
                  .map(payment =>
                    this.renderPaymentAndRefundDetail(
                      payment,
                      feeType === 'OTHER'
                        ? Number.POSITIVE_INFINITY
                        : paymentByFeeTypeMap[feeType].remainToBePaidAmount,
                    ),
                  )}

                {this.navprops.pageType === 'RESTARTING' &&
                  feeType !== 'OTHER' &&
                  paymentByFeeTypeMap[feeType].remainToBePaidAmount > 0 && (
                    <View
                      style={{
                        marginTop: 10,
                        marginHorizontal: 10,
                        padding: 10,
                        backgroundColor: 'white',
                        borderRadius: 2,
                      }}
                    >
                      <AddPaymentButton
                        label="添加支付和应退记录"
                        onPress={() =>
                          this.go2paymentEditScreen({
                            feeType,
                            direction: refund.paymentList[0].direction,
                            remainToBePaidAmount:
                              paymentByFeeTypeMap[feeType].remainToBePaidAmount,
                            type: 'ADD',
                          })
                        }
                        type={'REFUND'}
                        disabled={this.state.isPageCommitting}
                      />
                    </View>
                  )}
              </React.Fragment>
            ))}
          </KeyboardAwareScrollView>

          {this.navprops.pageType === 'ORDER_RENT_CANCEL' &&
            !this.navprops.needReviewOrder && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  onPress={() => this.nav.goBack()}
                  disabled={this.state.isPageCommitting}
                  style={{
                    flex: 1,
                    height: 50,
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      color: 'white',
                      fontSize: 18,
                    }}
                  >
                    放弃取消
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={this.cancelOrder}
                  disabled={this.state.isPageCommitting}
                  style={{
                    flex: 1,
                    height: 50,
                    justifyContent: 'center',
                    backgroundColor: 'white',
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      color: colors.primary,
                      fontSize: 18,
                    }}
                  >
                    确认取消
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          {this.navprops.pageType === 'ORDER_RENT_CANCEL' &&
            this.navprops.needReviewOrder && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  onPress={this.cancelOrder}
                  disabled={this.state.isPageCommitting}
                  style={{
                    flex: 1,
                    height: 50,
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      color: 'white',
                      fontSize: 18,
                    }}
                  >
                    确认订单审核不通过
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          {this.navprops.pageType !== 'ORDER_RENT_CANCEL' &&
            this.navprops.pageType !== 'DETAIL' &&
            this.navprops.pageType !== 'SHOP_MANAGER_EXAMINING' &&
            this.navprops.pageType !== 'ACCOUNTANT_EXAMINING' &&
            this.navprops.pageType !== 'CEO_EXAMINING' &&
            this.navprops.pageType !== 'RESTARTING' && (
              <TouchableOpacity
                accessible={true}
                accessibilityLabel={
                  '按钮-' + confirmBtnMap[this.navprops.pageType].label
                }
                onPress={confirmBtnMap[this.navprops.pageType].func}
                disabled={this.state.isPageCommitting}
                style={{
                  height: 50,
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                  }}
                >
                  {confirmBtnMap[this.navprops.pageType].label}
                </Text>
              </TouchableOpacity>
            )}
          {(this.navprops.pageType === 'SHOP_MANAGER_EXAMINING' ||
            this.navprops.pageType === 'ACCOUNTANT_EXAMINING' ||
            this.navprops.pageType === 'CEO_EXAMINING') && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <TouchableOpacity
                accessible={true}
                accessibilityLabel={
                  '按钮-' + confirmBtnMap[this.navprops.pageType].label.unpass
                }
                onPress={confirmBtnMap[this.navprops.pageType].func.unpass}
                disabled={this.state.isPageCommitting}
                style={{
                  flex: 1,
                  height: 50,
                  justifyContent: 'center',
                  backgroundColor: 'white',
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: colors.primary,
                    fontSize: 18,
                  }}
                >
                  {confirmBtnMap[this.navprops.pageType].label.unpass}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessible={true}
                accessibilityLabel={
                  '按钮-' + confirmBtnMap[this.navprops.pageType].label.pass
                }
                onPress={confirmBtnMap[this.navprops.pageType].func.pass}
                disabled={this.state.isPageCommitting}
                style={{
                  flex: 1,
                  height: 50,
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                  }}
                >
                  {confirmBtnMap[this.navprops.pageType].label.pass}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {this.navprops.pageType === 'RESTARTING' && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              {!this.navprops.canNotSaveTemporarily && (
                <TouchableOpacity
                  accessible={true}
                  accessibilityLabel="按钮-暂存"
                  onPress={this.modifyRefund}
                  disabled={this.state.isPageCommitting}
                  style={{
                    flex: 1,
                    height: 50,
                    justifyContent: 'center',
                    backgroundColor: 'white',
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      color: colors.primary,
                      fontSize: 18,
                    }}
                  >
                    暂存
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessible={true}
                accessibilityLabel="按钮-提交"
                onPress={this.handleRestartRefund}
                disabled={this.state.isPageCommitting}
                style={{
                  flex: 1,
                  height: 50,
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: 'white',
                    fontSize: 18,
                  }}
                >
                  提交
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Modal
            visible={this.state.isConfirmModalVisible}
            onRequestClose={() =>
              this.setState({ isConfirmModalVisible: false })
            }
            transparent={true}
            supportedOrientations={['portrait', 'landscape']}
          >
            <TouchableWithoutFeedback accessible={false}>
              <View
                style={{
                  height: Dimensions.get('window').height,
                  width: Dimensions.get('window').width,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                }}
              >
                <View
                  style={{
                    backgroundColor: 'white',
                    padding: 20,
                    marginHorizontal: 30,
                    marginBottom: 40,
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      fontSize: 18,
                      fontWeight: 'bold',
                    }}
                  >
                    {this.state.confirmModal.title}
                  </Text>

                  <Text
                    style={{
                      marginTop: 8,
                      lineHeight: 21,
                    }}
                  >
                    {this.state.confirmModal.hint}
                  </Text>

                  {moment(refund.orderRent.vehicleReceiveTime).isBefore(
                    '2019-01-18',
                    'day',
                  ) &&
                    this.state.confirmModal.needToStartProcess && (
                      <React.Fragment>
                        <View
                          style={{
                            marginTop: 8,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Text>是否要启动系统退款流程：</Text>
                          <MySwitch
                            trueTitle="是"
                            falseTitle="否"
                            onPress={() => {
                              this.setState(prevState => ({
                                confirmModal: update(prevState.confirmModal, {
                                  needLaunchWorkflow: {
                                    $set: !prevState.confirmModal
                                      .needLaunchWorkflow,
                                  },
                                }),
                              }));
                            }}
                            value={this.state.confirmModal.needLaunchWorkflow}
                          />
                        </View>

                        <Text
                          style={{
                            marginTop: 8,
                            fontSize: 13,
                            color: 'gray',
                          }}
                        >
                          注：选择是，将启动系统退款流程；
                          选择否，表明您已经启动过线下纸质退款流程，将不会从线上流程完成退款。
                        </Text>
                      </React.Fragment>
                    )}

                  <FooterButtonSection
                    leftButtonTitle="返回"
                    rightButtonTitle={this.state.confirmModal.btnText}
                    onLeftButtonPress={() =>
                      this.setState({ isConfirmModalVisible: false })
                    }
                    onRightButtonPress={this.state.confirmModal.func}
                    leftButtonStyle={{ marginRight: 10 }}
                    style={{
                      marginTop: 15,
                      marginBottom: 0,
                    }}
                  />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          <Modal
            visible={this.state.isPageCommitting}
            transparent={true}
            supportedOrientations={['portrait', 'landscape']}
          >
            <TouchableWithoutFeedback>
              <View
                style={{
                  height: Dimensions.get('window').height,
                  width: Dimensions.get('window').width,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                }}
              >
                <Image source={require('src/images/page_committing.gif')} />
                <Text
                  style={{
                    marginTop: 18,
                    fontSize: 18,
                    color: colors.textGray,
                  }}
                >
                  提交中
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          <Modal
            visible={this.state.isDeductionPaymentModalVisible}
            onRequestClose={() =>
              this.setState({ isDeductionPaymentModalVisible: false })
            }
            transparent={true}
          >
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
              <View
                style={{
                  height: Dimensions.get('window').height,
                  width: Dimensions.get('window').width,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: 'white',
                    padding: 20,
                    marginHorizontal: 30,
                    marginBottom: 40,
                  }}
                >
                  <Text
                    style={{
                      textAlign: 'center',
                      fontSize: 18,
                      fontWeight: 'bold',
                      marginBottom: 10,
                    }}
                  >
                    {this.state.deductionPaymentModalType === 'ADD' && '添加'}
                    {this.state.deductionPaymentModalType === 'MODIFY' &&
                      '修改'}
                    需扣除费用
                  </Text>

                  <Text style={{ color: colors.textGray }}>
                    —
                    {
                      store.getState().enums.payMode.map[
                        this.state.modalDeductionPayment.payMode
                      ]
                    }
                    已付：￥
                    {this.state.deductionPaymentModalFee}
                  </Text>

                  <View
                    style={{
                      marginTop: 10,
                      height: 27,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textDarkGray,
                      }}
                    >
                      扣除费用：
                    </Text>
                    <DropdownSelector
                      accessibilityLabel="下拉选择-扣除费用"
                      style={{ flex: 2, borderRadius: 0 }}
                      dropdownProps={{
                        options: feeTypeList.map(feeType => feeType.desc),
                        defaultIndex: defaultFeeTypeIndex,
                        defaultValue:
                          defaultFeeTypeIndex === -1
                            ? '请选择'
                            : store.getState().enums.feeType.map[
                                this.state.modalDeductionPayment.feeType
                              ],
                        textStyle: {
                          color:
                            defaultFeeTypeIndex < 0 ? 'lightgray' : 'black',
                        },
                        onSelect: index => {
                          this.setState(prevState => ({
                            modalDeductionPayment: update(
                              prevState.modalDeductionPayment,
                              {
                                feeType: { $set: feeTypeList[index].name },
                                name: {
                                  $set:
                                    feeTypeList[index].name === 'OIL_FEE' ||
                                    feeTypeList[index].name ===
                                      'OVER_TIME_FEE' ||
                                    feeTypeList[index].name === 'OVER_KM_FEE' ||
                                    feeTypeList[index].name === 'SERVICE_FEE' ||
                                    feeTypeList[index].name === 'PENALTY'
                                      ? feeTypeList[index].desc
                                      : null,
                                },
                              },
                            ),
                          }));
                        },
                      }}
                    />
                  </View>

                  <View
                    style={{
                      marginTop: 10,
                      height: 27,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textDarkGray,
                      }}
                    >
                      扣除金额：
                    </Text>
                    <MyTextInput
                      placeholder="输入扣除金额"
                      value={`${
                        this.state.modalDeductionPayment.fee == null
                          ? ''
                          : this.state.modalDeductionPayment.fee
                      }`}
                      keyboardType="numeric"
                      onChangeText={input => {
                        let fee =
                          isNaN(parseFloat(input)) || parseFloat(input) < 0
                            ? null
                            : parseFloat(input);
                        this.setState(prevState => ({
                          modalDeductionPayment: update(
                            prevState.modalDeductionPayment,
                            {
                              fee: {
                                $apply: () => {
                                  if (
                                    fee >
                                    this.state.modalDeductionPayment
                                      .remainToBePaidAmount
                                  ) {
                                    ui.toastError(
                                      `扣除费用不能大于剩余未扣除的金额！`,
                                    );
                                    return null;
                                  } else {
                                    return fee;
                                  }
                                },
                              },
                            },
                          ),
                        }));
                      }}
                    />
                  </View>

                  <View
                    style={{
                      marginTop: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: colors.textDarkGray,
                      }}
                    >
                      扣费备注：
                    </Text>
                    <TextInput
                      multiline
                      onChangeText={text =>
                        this.setState(prevState => ({
                          modalDeductionPayment: update(
                            prevState.modalDeductionPayment,
                            {
                              remark: { $set: text },
                            },
                          ),
                        }))
                      }
                      value={this.state.modalDeductionPayment.remark}
                      style={{
                        flex: 1,
                        height: 80,
                        borderWidth: 0.5,
                        borderColor: '#dfdfdf',
                        textAlignVertical: 'top',
                        color: colors.textDarkGray,
                        marginTop: 10,
                        paddingLeft: 10,
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        this.setState({ isDeductionPaymentModalVisible: false })
                      }
                      style={{ padding: 10 }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 16 }}>
                        取消
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!this.state.modalDeductionPayment.remark) {
                          ui.toastError('请填入扣费备注');
                          return;
                        }
                        this.setState({
                          isDeductionPaymentModalVisible: false,
                        });
                        this.saveDeductionPayment(
                          this.state.modalDeductionPayment,
                          this.state.deductionPaymentModalType,
                        );
                      }}
                      disabled={
                        !this.state.modalDeductionPayment.feeType ||
                        !this.state.modalDeductionPayment.fee
                      }
                      style={{ padding: 10, marginLeft: 10 }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 16 }}>
                        确认
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        </View>
      );
    }
  }

  @autobind
  renderPaymentAndRefundDetail(payment, remainToBePaidAmount) {
    const refundDetail = this.state.refund.refundDetailList.find(
      refundDetail => refundDetail.paymentId === payment.id,
    );
    const refundDetailIndex = this.state.refund.refundDetailList.findIndex(
      refundDetail => refundDetail.paymentId === payment.id,
    );

    const unrefundFee =
      refundDetail.fee == null
        ? 0
        : refundDetail.fee -
          this.state.refund.paymentList.reduce((previousValue, payment) => {
            if (payment.refundDetailId === refundDetail.id) {
              return previousValue + payment.fee;
            } else {
              return previousValue;
            }
          }, 0);

    const deductionPaymentList = this.state.deductionPaymentList.filter(
      deductionPayment => deductionPayment.parentPaymentId === payment.id,
    );
    const totalDeductedFee = deductionPaymentList.reduce(
      (previousValue, deductionPayment) => {
        return previousValue + deductionPayment.fee;
      },
      0,
    );

    const status = this.state.refund.bean.status;
    const refundDetailFeeEditable =
      (this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
        this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN' ||
        this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN' ||
        this.navprops.pageType === 'RESTARTING') &&
      totalDeductedFee < payment.fee;
    const refundDetailAccountEditable =
      this.navprops.pageType !== 'CASHIER_REFUNDING' &&
      this.navprops.pageType !== 'DETAIL';
    const showRefundDetailAccount =
      payment.payMode !== 'POS_PRE_LICENSING' &&
      payment.payMode !== 'CHANNEL' &&
      (status === 'CASHIER_REFUNDING' || status === 'FINISH');

    return (
      <View
        key={payment.id}
        style={{
          marginTop: 10,
          marginHorizontal: 10,
          padding: 10,
          backgroundColor: 'white',
          borderRadius: 2,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            color: colors.textDarkGray,
          }}
        >
          - {store.getState().enums.payMode.map[payment.payMode]}
          支付：
          <Text style={{ color: colors.textDarkGray }}>￥{payment.fee}</Text>
        </Text>

        <Payment
          key={'' + payment.id}
          payment={payment}
          isEditable={
            this.navprops.pageType === 'RESTARTING' &&
            (payment.financialStatus === 'TO_REVIEW' ||
              payment.financialStatus === 'REJECTED' ||
              payment.financialStatus === 'TO_REVIEW_REJECTED')
          }
          showReviewLink={this.navprops.pageType === 'ACCOUNTANT_EXAMINING'}
          onModify={() => {
            this.go2paymentEditScreen({
              feeType: payment.feeType,
              direction: payment.direction,
              payment,
              remainToBePaidAmount: remainToBePaidAmount + payment.fee,
              type: 'ADD',
            });
          }}
          onDelete={() => this.deletePayment(payment.id)}
          deleteHint={'确定删除该支付记录(对应的退款备注也会被删除)？'}
          setOperatePaymentId={() =>
            this.setState({ operatePaymentId: payment.id })
          }
        />

        <View
          style={{
            marginTop: 10,
          }}
        >
          {payment.payMode === 'POS_PRE_LICENSING' &&
            this.navprops.pageType !== 'ORDER_RENT_CANCEL' &&
            this.navprops.pageType !== 'DAMAGE_DEPOSIT_RETURN' &&
            this.navprops.pageType !== 'VIOLATION_DEPOSIT_RETURN' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      color: colors.textDarkGray,
                    }}
                  >
                    - 已退：￥
                    {refundDetail.fee == null ? 0 : refundDetail.fee}
                  </Text>
                </View>
              </View>
            )}

          {payment.payMode !== 'POS_PRE_LICENSING' && (
            <View>
              <Text
                style={{
                  fontSize: 15,
                  color: '#D60012',
                }}
              >
                - 扣除费用：
                {refundDetail.fee != null &&
                  '总计：' + (payment.fee - refundDetail.fee)}
              </Text>
              {deductionPaymentList.map(deductionPayment => (
                <View
                  key={deductionPayment.flatListKey}
                  style={{
                    marginTop: 10,
                    backgroundColor: '#f8f8f8',
                    borderRadius: 4,
                  }}
                >
                  <DetailField
                    label={`扣除${
                      store.getState().enums.feeType.map[
                        deductionPayment.feeType
                      ]
                    }:`}
                    value={deductionPayment.fee}
                    labelColor="orange"
                    style={{ height: 33, marginHorizontal: 10 }}
                  />

                  {!!deductionPayment.remark && (
                    <DetailField
                      label="扣费备注:"
                      hasBorderBottom={false}
                      style={{ marginHorizontal: 10 }}
                    >
                      <Text style={{ flex: 1 }}>{deductionPayment.remark}</Text>
                    </DetailField>
                  )}

                  {(this.navprops.pageType === 'ORDER_RENT_CANCEL' ||
                    this.navprops.pageType === 'DAMAGE_DEPOSIT_RETURN' ||
                    this.navprops.pageType === 'VIOLATION_DEPOSIT_RETURN' ||
                    this.navprops.pageType === 'RESTARTING') && (
                    <View
                      style={{
                        height: 32,
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                      }}
                    >
                      <TouchableOpacity
                        onPress={() =>
                          this.setState({
                            isDeductionPaymentModalVisible: true,
                            deductionPaymentModalType: 'MODIFY',
                            modalDeductionPayment: {
                              ...deductionPayment,
                              remainToBePaidAmount:
                                refundDetail.fee + deductionPayment.fee,
                              refundDetailIndex,
                              feeBefore: deductionPayment.fee,
                            },
                            deductionPaymentModalFee: payment.fee,
                          })
                        }
                      >
                        <Image
                          source={require('src/images/icon_revise.png')}
                          style={{ width: 20, height: 20 }}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            '确认',
                            '确认删除该扣除费用？',
                            [
                              { text: '取消' },
                              {
                                text: '确定',
                                onPress: () =>
                                  this.deleteDeductionPayment({
                                    ...deductionPayment,
                                    refundDetailIndex,
                                  }),
                              },
                            ],
                            { cancelable: false },
                          );
                        }}
                      >
                        <Image
                          source={require('src/images/icon_delete.png')}
                          style={{
                            marginLeft: 20,
                            marginRight: 14,
                            width: 20,
                            height: 20,
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              {refundDetailFeeEditable && (
                <AddPaymentButton
                  label="添加需扣除费用"
                  onPress={() =>
                    this.setState({
                      isDeductionPaymentModalVisible: true,
                      deductionPaymentModalType: 'ADD',
                      modalDeductionPayment: {
                        payMode: payment.payMode,
                        parentPaymentId: payment.id,
                        remainToBePaidAmount: refundDetail.fee,
                        refundDetailIndex,
                      },
                      deductionPaymentModalFee: payment.fee,
                    })
                  }
                  type={'ADD'}
                  disabled={this.state.isPageCommitting}
                  style={{ marginTop: 10 }}
                />
              )}
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: '#D60012',
                  }}
                >
                  - 应退：
                  {refundDetail.fee == null ? 0 : refundDetail.fee}
                </Text>
                {unrefundFee > 0 ? (
                  <Text
                    style={{
                      fontSize: 15,
                      color: '#D60012',
                    }}
                  >
                    未退：
                    {unrefundFee}
                  </Text>
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      color: colors.textGray,
                    }}
                  >
                    已退
                  </Text>
                )}
              </View>
              {showRefundDetailAccount && (
                <TouchableOpacity
                  onPress={() =>
                    this.nav.push('PdfViewer', {
                      url: refundDetail.applicationFormUrl,
                      fileName: '退款申请单.pdf',
                      canDownload: true,
                    })
                  }
                  disabled={!refundDetail.applicationFormUrl}
                  style={{
                    marginLeft: 10,
                    padding: 5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      color: colors.primary,
                      textDecorationLine: 'underline',
                    }}
                  >
                    查看申请单
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {showRefundDetailAccount && (
          <React.Fragment>
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  marginLeft: 10,
                  fontSize: 15,
                  color: colors.textDarkGray,
                }}
              >
                退款账户：
              </Text>
              {refundDetailAccountEditable ? (
                <MyTextInput
                  keyboardType="numeric"
                  value={`${
                    refundDetail.account == null ? '' : refundDetail.account
                  }`}
                  onChangeText={input => {
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            account: {
                              $set:
                                isNaN(parseInt(input)) || parseInt(input) < 0
                                  ? null
                                  : parseInt(input),
                            },
                          },
                        },
                      }),
                    }));
                  }}
                  accessibilityLabel="输入框-退款账户"
                  style={{
                    height: 27,
                    width: 80,
                    marginRight: 5,
                    paddingHorizontal: 5, // iOS 下默认没有左 padding,
                    borderWidth: 1,
                    borderColor: 'lightgray',
                    borderRadius: 0,
                  }}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 15,
                    color: colors.textDarkGray,
                  }}
                >
                  {refundDetail.account}
                </Text>
              )}
            </View>

            <View
              style={{
                marginTop: refundDetailAccountEditable ? 10 : 15,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  marginLeft: 10,
                  fontSize: 15,
                  color: colors.textDarkGray,
                }}
              >
                开户银行：
              </Text>
              {refundDetailAccountEditable ? (
                <MyTextInput
                  value={refundDetail.bankOfDeposit}
                  onChangeText={input => {
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            bankOfDeposit: {
                              $set: input,
                            },
                          },
                        },
                      }),
                    }));
                  }}
                  accessibilityLabel="输入框-退款开户行"
                  style={{
                    height: 27,
                    width: 80,
                    marginRight: 5,
                    paddingHorizontal: 5, // iOS 下默认没有左 padding,
                    borderWidth: 1,
                    borderColor: 'lightgray',
                    borderRadius: 0,
                  }}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 15,
                    color: colors.textDarkGray,
                  }}
                >
                  {refundDetail.account}
                </Text>
              )}
            </View>
          </React.Fragment>
        )}

        {status !== 'NEW' && (
          <View>
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: colors.textDarkGray,
              }}
            >
              - 销售备注：
            </Text>

            {!status || status === 'RESTARTING' ? (
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={refundDetail.deliverRemark}
                  onChangeText={remark =>
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            deliverRemark: {
                              $set: remark.length === 0 ? null : remark,
                            },
                          },
                        },
                      }),
                    }))
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            ) : (
              <Text
                style={{
                  marginTop: 4,
                  marginLeft: 12,
                  lineHeight: 20,
                  color: colors.textGray,
                }}
              >
                {refundDetail.deliverRemark}
              </Text>
            )}
          </View>
        )}

        {(status === 'SHOP_MANAGER_EXAMINING' ||
          status === 'CEO_EXAMINING' ||
          status === 'ACCOUNTANT_EXAMINING' ||
          status === 'CASHIER_REFUNDING' ||
          status === 'FINISH' ||
          (status === 'RESTARTING' &&
            !!this.state.refund.bean.shopManagerRemark)) && (
          <View>
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: colors.textDarkGray,
              }}
            >
              - 店长备注：
            </Text>

            {this.navprops.pageType === 'SHOP_MANAGER_EXAMINING' ? (
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={refundDetail.shopManagerRemark}
                  onChangeText={remark =>
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            shopManagerRemark: {
                              $set: remark.length === 0 ? null : remark,
                            },
                          },
                        },
                      }),
                    }))
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            ) : (
              <Text
                style={{
                  marginTop: 4,
                  marginLeft: 12,
                  lineHeight: 20,
                  color: colors.textGray,
                }}
              >
                {refundDetail.shopManagerRemark}
              </Text>
            )}
          </View>
        )}

        {(status === 'ACCOUNTANT_EXAMINING' ||
          status === 'CEO_EXAMINING' ||
          status === 'CASHIER_REFUNDING' ||
          status === 'FINISH' ||
          (status === 'RESTARTING' &&
            !!this.state.refund.bean.accountantRemark)) && (
          <View>
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: colors.textDarkGray,
              }}
            >
              - 会计备注：
            </Text>

            {this.navprops.pageType === 'ACCOUNTANT_EXAMINING' ? (
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={refundDetail.accountantRemark}
                  onChangeText={remark =>
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            accountantRemark: {
                              $set: remark.length === 0 ? null : remark,
                            },
                          },
                        },
                      }),
                    }))
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            ) : (
              <Text
                style={{
                  marginTop: 4,
                  marginLeft: 12,
                  lineHeight: 20,
                  color: colors.textGray,
                }}
              >
                {refundDetail.accountantRemark}
              </Text>
            )}
          </View>
        )}

        {(status === 'CEO_EXAMINING' ||
          status === 'CASHIER_REFUNDING' ||
          status === 'FINISH' ||
          (status === 'RESTARTING' && !!this.state.refund.bean.ceoRemark)) && (
          <View>
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: colors.textDarkGray,
              }}
            >
              - CEO备注：
            </Text>

            {this.navprops.pageType === 'CEO_EXAMINING' ? (
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={refundDetail.ceoRemark}
                  onChangeText={remark =>
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            ceoRemark: {
                              $set: remark.length === 0 ? null : remark,
                            },
                          },
                        },
                      }),
                    }))
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            ) : (
              <Text
                style={{
                  marginTop: 4,
                  marginLeft: 12,
                  lineHeight: 20,
                  color: colors.textGray,
                }}
              >
                {refundDetail.ceoRemark}
              </Text>
            )}
          </View>
        )}

        {(status === 'CASHIER_REFUNDING' || status === 'FINISH') && (
          <View>
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: colors.textDarkGray,
              }}
            >
              - 出纳备注：
            </Text>

            {this.navprops.pageType === 'CASHIER_REFUNDING' ? (
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  placeholderTextColor="lightgray"
                  multiline
                  value={refundDetail.cashierRemark}
                  onChangeText={remark =>
                    this.setState(prevState => ({
                      refund: update(prevState.refund, {
                        refundDetailList: {
                          [refundDetailIndex]: {
                            cashierRemark: {
                              $set: remark.length === 0 ? null : remark,
                            },
                          },
                        },
                      }),
                    }))
                  }
                  style={{
                    flex: 1,
                    height: 80,
                    marginVertical: 5,
                    padding: 5,
                    lineHeight: 21,
                    textAlignVertical: 'top',
                    color: colors.textDarkGray,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              </View>
            ) : (
              <Text
                style={{
                  marginTop: 4,
                  marginLeft: 12,
                  lineHeight: 20,
                  color: colors.textGray,
                }}
              >
                {refundDetail.cashierRemark}
              </Text>
            )}
          </View>
        )}

        {unrefundFee > 0 &&
          this.navprops.pageType === 'CASHIER_REFUNDING' &&
          payment.payMode !== 'POS_PRE_LICENSING' &&
          frontPayMode.includes(payment.payMode) && (
            <AddPaymentButton
              label={payModeLabel[payment.payMode] + '退款'}
              onPress={() =>
                this.refundByBackServiceDirectly(refundDetail, payment.payMode)
              }
              type={'REFUND'}
              disabled={this.state.isPageCommitting}
              style={{ marginTop: 10 }}
            />
          )}

        {unrefundFee > 0 &&
          this.navprops.pageType === 'CASHIER_REFUNDING' &&
          payment.payMode !== 'POS_PRE_LICENSING' &&
          !frontPayMode.includes(payment.payMode) && (
            <AddPaymentButton
              label="添加退款"
              onPress={() =>
                this.go2paymentEditScreen({
                  feeType: payment.feeType,
                  refundDetailId: refundDetail.id,
                  remainToBePaidAmount: unrefundFee,
                  direction:
                    payment.direction === 'CUSTOMER_TO_WAGONS'
                      ? 'WAGONS_TO_CUSTOMER'
                      : 'WAGONS_TO_PEER',
                  type: 'EDIT',
                  payMode: payment.payMode,
                })
              }
              type={'REFUND'}
              disabled={this.state.isPageCommitting}
              style={{ marginTop: 10 }}
            />
          )}

        {this.state.refund.paymentList
          .filter(payment => payment.refundDetailId === refundDetail.id)
          .map(payment => (
            <Payment
              key={'' + payment.id}
              payment={payment}
              isEditable={this.navprops.pageType === 'CASHIER_REFUNDING'}
            />
          ))}
      </View>
    );
  }
}
