import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { zhlInitSessionStore } from '../service/SessionStore';

/**
 * ZHLBuilder 鸿蒙端入口。
 * 页面结构：Index（登录门 + 设备/任务/我的 三个 Tab + Navigation 路由栈）
 *   → RemotePanel（远控面板）/ Register（注册）/ PinGate（PIN）/ DeviceDetail / TaskOutput
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    // 规格 §一 逐色给定的是深色品牌，§六 又明令「禁止浅色主题」。
    // 不显式强制 DARK 时，系统处于浅色模式会让窗口底色与状态栏图标跟着系统走：
    // 冷启动先闪一层浅色底，深色页面上还可能出现暗色图标贴深色底看不清。
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
    } catch (err) {
      console.error('[ZHLBuilder] setColorMode failed: ' + JSON.stringify(err));
    }
    // 凭据存储要在首帧之前打开，所以放 onCreate 而不是页面 aboutToAppear：
    // 页面阶段拿不到 host context 时 preferences 打不开，token 恒为空，
    // 表现就是「记住我失效，杀掉 App 重开还要重新登录」。
    zhlInitSessionStore(this.context).catch((err: BusinessError) => {
      // 打不开本地存储不能把门永远卡在恢复中，退回手动登录并留下线索。
      console.error('[ZHLBuilder] session store init failed: ' + JSON.stringify(err));
      AppStorage.setOrCreate('zhlAuthState', 'loggedOut');
    });
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err: BusinessError) => {
      if (err.code !== 0) {
        console.error('[ZHLBuilder] loadContent failed: ' + JSON.stringify(err));
      }
    });
  }
}
