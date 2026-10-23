import { common } from '@kit.AbilityKit';
import { zhlHasToken } from '../service/AuthService';
import { zhlParsePairQr, zhlStartPairScan, ZhlPairQr } from '../service/ScanService';
import { zhlSessionStoreReady } from '../service/SessionStore';
import { ZhlDeviceDetailParam, ZhlPinGateParam, ZhlTaskOutputParam } from '../model/Types';
import { ZHL_BG, ZHL_CARD_GAP, ZHL_PAGE_PAD, ZHL_TEXT } from '../common/Theme';
import { ZhlSkeletonBar } from '../components/SkeletonBar';
import {
  ZhlTabBarItem, ZhlTabSpec, ZHL_TAB_BAR_HEIGHT, zhlTabBarBlurStyle, zhlTabBarSolid, zhlTabSpecs,
} from '../components/ImmersiveTabBar';
import { ZhlLoginPage } from './Login';
import { ZhlDevicesPane } from './panes/DevicesPane';
import { ZhlTasksPane } from './panes/TasksPane';
import { ZhlProfilePane } from './panes/ProfilePane';

/**
 * 应用外壳：登录门 + 底部导航（设备 / 任务 / 我的）+ 系统路由表承载的子页。
 *
 * 页面跳转一律走 Navigation + 系统路由表（resources/base/profile/router_map.json），
 * 不用 @ohos.router。五个子页：RemotePanel / Register / PinGate / DeviceDetail / TaskOutput。
 */

interface ZhlTabItemParam {
  itemIndex: number;
}

@Entry
@Component
struct Index {
  private pathStack: NavPathStack = new NavPathStack();
  private tabsController: TabsController = new TabsController();
  /**
   * 登录门三态：unknown（凭据恢复中）/ loggedIn / loggedOut。
   *
   * 本地初值改成 'unknown' 而不是 'loggedOut'：冷启动时 AppStorage 里还没有这个键，
   * 按 AppStorage 的规则此时取本地初值。旧初值是 'loggedOut'，于是恢复期间第一帧
   * 必然先渲染登录页，等 HUKS 读完再跳主界面 —— 用户看到的是「闪一下登录页」，
   * 万一 preferences 打开失败就永远停在登录页，也就是「记住我根本没生效」。
   */
  @StorageLink('zhlAuthState') authState: string = 'unknown';
  @State currentTabIndex: number = 0;

  aboutToAppear(): void {
    // 初始化由 EntryAbility.onCreate 发起，这里只等它的结果再落登录态。
    zhlSessionStoreReady()
      .then(() => zhlHasToken())
      .then((hasToken: boolean) => {
        AppStorage.setOrCreate('zhlAuthState', hasToken ? 'loggedIn' : 'loggedOut');
      })
      .catch(() => {
        AppStorage.setOrCreate('zhlAuthState', 'loggedOut');
      });
  }

  /** 恢复凭据期间的占位：按规格用骨架条，不许用占满屏的转圈 */
  @Builder
  restoringView() {
    Column({ space: ZHL_CARD_GAP }) {
      ZhlSkeletonBar({ barWidth: '46%', barHeight: 16 })
      ZhlSkeletonBar({ barWidth: '100%', barHeight: 62 })
      ZhlSkeletonBar({ barWidth: '100%', barHeight: 62 })
      Text('正在恢复登录状态…')
        .fontSize(13)
        .fontColor(ZHL_TEXT)
        .opacity(0.55)
    }
    .width('100%')
    .height('100%')
    .padding(ZHL_PAGE_PAD)
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(ZHL_BG)
  }

  // ===== 跳转 =====

  openRegister(): void {
    // Register 页不读参数，这里传空字符串占位（param 必填）
    this.pathStack.pushDestination(new NavPathInfo('Register', ''));
  }

  openRemotePanel(): void {
    this.pathStack.pushDestination(new NavPathInfo('RemotePanel', ''));
  }

  openDeviceDetail(deviceId: number, deviceName: string): void {
    const param: ZhlDeviceDetailParam = { deviceId: deviceId, deviceName: deviceName };
    this.pathStack.pushDestination(new NavPathInfo('DeviceDetail', param));
  }

  openTaskOutput(deviceId: number, deviceName: string, taskId: number): void {
    const param: ZhlTaskOutputParam = { deviceId: deviceId, taskId: taskId, deviceName: deviceName };
    this.pathStack.pushDestination(new NavPathInfo('TaskOutput', param));
  }

  openPinGate(deviceId: number, deviceName: string): void {
    const param: ZhlPinGateParam = {
      mode: 'gate',
      pairCode: '',
      deviceId: deviceId,
      deviceName: deviceName,
      nextPage: '',
    };
    this.pathStack.pushDestination(new NavPathInfo('PinGate', param));
  }

  /** 扫码绑定：校验 app 字段后带配对码进 PIN 页设置 6 位 PIN */
  doScanBind(): void {
    zhlStartPairScan(this.getUIContext().getHostContext() as common.UIAbilityContext)
      .then((raw: string) => {
        const qr: ZhlPairQr | undefined = zhlParsePairQr(raw);
        if (qr === undefined) {
          this.getUIContext().getPromptAction().showToast({
            message: '二维码内容无法识别',
          });
          return;
        }
        const code: string = qr.pairCode ?? '';
        AppStorage.setOrCreate('zhlPendingPairCode', code);
        const param: ZhlPinGateParam = {
          mode: 'pair',
          pairCode: code,
          deviceId: 0,
          deviceName: '',
          nextPage: '',
        };
        this.pathStack.pushDestination(new NavPathInfo('PinGate', param));
      })
      .catch(() => {
        // 用户取消扫码
      });
  }

  // ===== 底部导航 =====

  tabLabelOf(index: number): string {
    const specs: Array<ZhlTabSpec> = zhlTabSpecs();
    for (let i = 0; i < specs.length; i++) {
      if (specs[i].tabIndex === index) {
        return specs[i].tabLabel;
      }
    }
    return '';
  }

  tabIconOf(index: number): Resource {
    const specs: Array<ZhlTabSpec> = zhlTabSpecs();
    for (let i = 0; i < specs.length; i++) {
      if (specs[i].tabIndex === index) {
        return specs[i].tabIcon;
      }
    }
    return $r('sys.symbol.house');
  }

  @Builder
  tabItem(param: ZhlTabItemParam) {
    ZhlTabBarItem({
      itemLabel: this.tabLabelOf(param.itemIndex),
      itemSelected: param.itemIndex === this.currentTabIndex,
      itemIcon: this.tabIconOf(param.itemIndex),
    })
  }

  build() {
    Navigation(this.pathStack) {
      if (this.authState === 'loggedIn') {
        Tabs({ barPosition: BarPosition.End, index: this.currentTabIndex, controller: this.tabsController }) {
          TabContent() {
            ZhlDevicesPane({
              onOpenDevice: (deviceId: number, deviceName: string) => {
                this.openDeviceDetail(deviceId, deviceName);
              },
              onScanBind: () => {
                this.doScanBind();
              },
            })
          }
          .tabBar(this.tabItem({ itemIndex: 0 }))

          TabContent() {
            ZhlTasksPane({
              onOpenTask: (deviceId: number, deviceName: string, taskId: number) => {
                this.openTaskOutput(deviceId, deviceName, taskId);
              },
              onUnlock: (deviceId: number, deviceName: string) => {
                this.openPinGate(deviceId, deviceName);
              },
            })
          }
          .tabBar(this.tabItem({ itemIndex: 1 }))

          TabContent() {
            ZhlProfilePane({
              onOpenRemotePanel: () => {
                this.openRemotePanel();
              },
            })
          }
          .tabBar(this.tabItem({ itemIndex: 2 }))
        }
        .barHeight(ZHL_TAB_BAR_HEIGHT + 12)
        .barBackgroundColor(zhlTabBarSolid())
        .barBackgroundBlurStyle(zhlTabBarBlurStyle())
        .animationDuration(240)
        .scrollable(false)
        .width('100%')
        .height('100%')
        .backgroundColor(ZHL_BG)
        .onChange((index: number) => {
          this.currentTabIndex = index;
        })
      } else if (this.authState === 'unknown') {
        this.restoringView()
      } else {
        ZhlLoginPage({
          onOpenRegister: () => {
            this.openRegister();
          },
        })
      }
    }
    .hideTitleBar(true)
    .mode(NavigationMode.Stack)
    .width('100%')
    .height('100%')
    .backgroundColor(ZHL_BG)
  }
}