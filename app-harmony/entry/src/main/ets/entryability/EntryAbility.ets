import { Ability, UIAbility } from '@kit.AbilityKit';

/**
 * ZHLBuilder 设备管理入口。
 * 页面：Index（登录/设备列表）→ PinGate（6 位 PIN 门）→ DeviceDetail（状态/任务/输出）。
 */
export default class EntryAbility extends UIAbility {
  onCreate(): void {
    AppStorage.setOrCreate('baseUrl', 'https://dis.zhl.asia');
  }

  onWindowStageCreate(windowStage: Ability.stageManager.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code !== 0) {
        console.error('[ZHLBuilder] loadContent failed: ' + JSON.stringify(err));
      }
    });
  }
}
