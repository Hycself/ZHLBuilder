import { ZhlModeOption, ZhlModelOption } from '../model/Types';
import { zhlModeText } from '../common/Format';
import {
  ZHL_ACCENT, ZHL_FAINT, ZHL_LINE, ZHL_RADIUS_CHIP, ZHL_TEXT, zhlAlpha,
} from '../common/Theme';

/**
 * 模型与权限模式选择（规格 §七之二 第 3 条 + §七之三）。
 *
 * 诚实规则（v3.3 修订版）：
 *  - models 长度 ≥ 1 → 渲染真实模型选择控件，default:true 的项预选；显示 name，副标题放 provider
 *  - models 为空 或 reported=false → 显示「跟随设备默认模型」，选择控件隐藏
 *    （绝不允许摆一份静态的"常见模型"列表）
 *  - mode 候选来自设备上报的 modes；设备没上报就不显示模式选择
 * 下发任务与续话时把选中的 id 原样传进 modelSelection（没选就不传，用设备默认值）。
 */
@Component
export struct ZhlModelModePicker {
  @Prop pickerModels: Array<ZhlModelOption> = [];
  @Prop pickerModes: Array<ZhlModeOption> = [];
  @Prop pickerEnabled: boolean = true;
  @Link selectedModel: string;
  @Link selectedMode: string;
  onPicked: (modelId: string, modeValue: string) => void = () => {
  };

  hasModels(): boolean {
    return this.pickerModels.length > 0;
  }

  hasModes(): boolean {
    return this.pickerModes.length > 0;
  }

  /** 当前生效的模型 id：用户选过就用用户的，否则用 default:true 的项，再否则用第一项 */
  effectiveModelId(): string {
    if (this.selectedModel.length > 0) {
      return this.selectedModel;
    }
    for (let i = 0; i < this.pickerModels.length; i++) {
      const option: ZhlModelOption = this.pickerModels[i];
      if (option.default === true) {
        return option.id ?? '';
      }
    }
    if (this.pickerModels.length > 0) {
      return this.pickerModels[0].id ?? '';
    }
    return '';
  }

  modelLabelOf(id: string): string {
    for (let i = 0; i < this.pickerModels.length; i++) {
      const option: ZhlModelOption = this.pickerModels[i];
      if ((option.id ?? '') === id) {
        const name: string = option.name ?? id;
        const provider: string = option.provider ?? '';
        if (provider.length > 0) {
          return `${name} · ${provider}`;
        }
        return name;
      }
    }
    return id;
  }

  currentModelLabel(): string {
    if (!this.hasModels()) {
      return '跟随设备默认模型';
    }
    return this.modelLabelOf(this.effectiveModelId());
  }

  effectiveMode(): string {
    if (this.selectedMode.length > 0) {
      return this.selectedMode;
    }
    if (this.pickerModes.length > 0) {
      return this.pickerModes[0].value ?? '';
    }
    return '';
  }

  currentModeLabel(): string {
    const value: string = this.effectiveMode();
    for (let i = 0; i < this.pickerModes.length; i++) {
      const option: ZhlModeOption = this.pickerModes[i];
      if ((option.value ?? '') === value) {
        return option.label ?? zhlModeText(value);
      }
    }
    return zhlModeText(value);
  }

  modelMenu(): Array<MenuElement> {
    const items: Array<MenuElement> = [];
    for (let i = 0; i < this.pickerModels.length; i++) {
      const option: ZhlModelOption = this.pickerModels[i];
      const id: string = option.id ?? '';
      const menuItem: MenuElement = {
        value: this.modelLabelOf(id),
        action: () => {
          this.selectedModel = id;
          this.onPicked(id, this.effectiveMode());
        },
      };
      items.push(menuItem);
    }
    return items;
  }

  modeMenu(): Array<MenuElement> {
    const items: Array<MenuElement> = [];
    for (let i = 0; i < this.pickerModes.length; i++) {
      const option: ZhlModeOption = this.pickerModes[i];
      const value: string = option.value ?? '';
      const menuItem: MenuElement = {
        value: option.label ?? zhlModeText(value),
        action: () => {
          this.selectedMode = value;
          this.onPicked(this.effectiveModelId(), value);
        },
      };
      items.push(menuItem);
    }
    return items;
  }

  build() {
    Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap }) {
      if (this.hasModels()) {
        Row({ space: 6 }) {
          Text(this.currentModelLabel())
            .fontSize(13)
            .fontColor(ZHL_TEXT)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)
          SymbolGlyph($r('sys.symbol.chevron_down'))
            .fontSize(14)
            .fontColor([ZHL_ACCENT])
        }
        .padding({ left: 12, right: 12, top: 8, bottom: 8 })
        .constraintSize({ maxWidth: '100%' })
        .backgroundColor(zhlAlpha(ZHL_ACCENT, 0.08))
        .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.30) })
        .borderRadius(ZHL_RADIUS_CHIP)
        .enabled(this.pickerEnabled)
        .bindMenu(this.modelMenu())
      } else {
        Row({ space: 6 }) {
          SymbolGlyph($r('sys.symbol.info_circle'))
            .fontSize(14)
            .fontColor([ZHL_FAINT])
          Text('跟随设备默认模型')
            .fontSize(13)
            .fontColor(ZHL_FAINT)
        }
        .padding({ left: 12, right: 12, top: 8, bottom: 8 })
        .backgroundColor('rgba(0,0,0,0)')
        .border({ width: 1, color: ZHL_LINE })
        .borderRadius(ZHL_RADIUS_CHIP)
      }

      if (this.hasModes()) {
        Row({ space: 6 }) {
          Text(this.currentModeLabel())
            .fontSize(13)
            .fontColor(ZHL_TEXT)
          SymbolGlyph($r('sys.symbol.chevron_down'))
            .fontSize(14)
            .fontColor([ZHL_ACCENT])
        }
        .padding({ left: 12, right: 12, top: 8, bottom: 8 })
        .backgroundColor(zhlAlpha(ZHL_ACCENT, 0.08))
        .border({ width: 1, color: zhlAlpha(ZHL_ACCENT, 0.30) })
        .borderRadius(ZHL_RADIUS_CHIP)
        .enabled(this.pickerEnabled)
        .bindMenu(this.modeMenu())
        .margin({ left: 10 })
      }
    }
    .width('100%')
  }
}