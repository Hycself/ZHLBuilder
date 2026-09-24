import { router } from '@kit.ArkUI';
import { promptAction } from '@kit.ArkUI';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Api, ApiError, getToken, setToken, myDevices } from '../model/Api';

/**
 * ZHLBuilder 首页：登录 → 设备列表（扫码绑定）。
 * 深色 ZHL 品牌风（#05090F 底 + #22D3EE 强调）。
 */
const BG = '#05090F';
const PANEL = '#0C1420';
const LINE = '#1B2839';
const TXT = '#E6EDF6';
const DIM = '#8CA0B8';
const FAINT = '#5A6E86';
const ACCENT = '#22D3EE';
const OK = '#34D399';
const DOWN = '#F87171';

@Entry
@Component
struct Index {
  @State loggedIn: boolean = false;
  @State account: string = '';
  @State password: string = '';
  @State loading: boolean = false;
  @State err: string = '';
  @State devices: Array<Record<string, Object>> = [];
  @State showServer: boolean = false;
  @State baseUrl: string = 'https://dis.zhl.asia';

  aboutToAppear(): void {
    getToken(this.context).then((t) => {
      if (t) {
        this.loggedIn = true;
        this.refresh();
      }
    });
  }

  refresh(): void {
    myDevices(this.context).then((list) => {
      this.devices = list;
      this.err = '';
    }).catch((e: ApiError) => {
      this.err = e.message;
    });
  }

  doLogin(): void {
    this.loading = true;
    this.err = '';
    login(this.context, this.account.trim(), this.password)
      .then(async (r) => {
        await setToken(this.context, String(r.token ?? ''));
        this.loading = false;
        this.loggedIn = true;
        this.refresh();
      })
      .catch((e: ApiError) => {
        this.loading = false;
        this.err = e.message;
      });
  }

  startScan(): void {
    const options: scanBarcode.ScanOptions = {
      scanTypes: [scanCore.ScanType.QR_CODE],
      enableMultiMode: false,
      enableAlbum: false,
    };
    scanBarcode.startScanForResult(this.context, options)
      .then((result) => {
        const raw = result.originalValue;
        this.handlePairQr(raw);
      })
      .catch((e: Error) => {
        hilog.info(0x0, 'ZHLBuilder', 'scan cancelled: ' + String(e));
      });
  }

  handlePairQr(raw: string): void {
    let pairCode = '';
    try {
      const o = JSON.parse(raw) as Record<string, Object>;
      pairCode = String(o.pairCode ?? '');
    } catch (_) {
      if (/^[A-Z2-9]{8}$/.test(raw)) {
        pairCode = raw;
      }
    }
    if (!pairCode) {
      promptAction.showToast({ message: '二维码内容无法识别' });
      return;
    }
    // 二级弹窗：输入 6 位 PIN 完成绑定
    promptAction.openCustomDialog({
      builder: () => {
        // 简化：用两段式 confirm 输入 PIN（完整自定义 UI 见 DeviceDetail 同款）
        promptAction.showToast({ message: `配对码 ${pairCode}：请在下方输入 PIN 绑定` });
      },
    }).catch(() => undefined);
    AppStorage.setOrCreate('pendingPairCode', pairCode);
    router.pushUrl({ url: 'pages/PinGate?mode=pair' });
  }

  build() {
    Column() {
      Row() {
        Text('ZB')
          .fontSize(13).fontWeight(FontWeight.ExtraBold).fontColor(ACCENT)
          .width(34).height(34).textAlign(TextAlign.Center)
          .backgroundColor('#123047').borderRadius(9)
        Text(' ZHLBuilder ').fontSize(19).fontWeight(FontWeight.Bold).fontColor(TXT)
        Text('设备').fontSize(13).fontColor(FAINT)
      }.width('100%').padding({ top: 16, bottom: 8 })

      if (!this.loggedIn) {
        Column({ space: 12 }) {
          TextInput({ placeholder: '账号（用户名或邮箱）', text: this.account })
            .onChange((v) => { this.account = v; })
            .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
          TextInput({ placeholder: '密码', text: this.password })
            .type(InputType.Password)
            .onChange((v) => { this.password = v; })
            .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
          if (this.showServer) {
            TextInput({ text: this.baseUrl })
              .onChange((v) => { this.baseUrl = v; })
              .backgroundColor(PANEL).borderColor(LINE).fontColor(TXT)
          }
          if (this.err) {
            Text(this.err).fontSize(13).fontColor(DOWN)
          }
          Button(this.loading ? '登录中…' : '登录')
            .width('100%').backgroundColor(ACCENT).fontColor('#06222B')
            .enabled(this.account !== '' && this.password !== '' && !this.loading)
            .onClick(() => {
              getStoreBase(this.context, this.baseUrl);
              this.doLogin();
            })
          Text('服务器设置').fontSize(12).fontColor(FAINT).onClick(() => {
            this.showServer = !this.showServer;
          })
        }.margin({ top: 48 })
      } else {
        Row() {
          Text('我的设备').fontSize(14).fontColor(FAINT)
          Blank()
          Button('扫码绑定').fontSize(13).backgroundColor(ACCENT).fontColor('#06222B')
            .onClick(() => this.startScan())
        }.width('100%').margin({ top: 8, bottom: 10 })

        if (this.err) {
          Text(this.err).fontSize(13).fontColor('#FBBF24').margin({ bottom: 8 })
        }

        List({ space: 10 }) {
          ForEach(this.devices, (d: Record<string, Object>) => {
            ListItem() {
              Column() {
                Row() {
                  Text(String(d.name ?? '')).fontSize(15).fontWeight(FontWeight.Medium).fontColor(TXT)
                  Blank()
                  Circle({ width: 9, height: 9 })
                    .fill(Boolean(d.online) ? OK : FAINT)
                  Text(Boolean(d.online) ? '在线' : '离线').fontSize(12).fontColor(DIM).margin({ left: 6 })
                }.width('100%')
                Text(`设备 #${d.id ?? ''}`)
                  .fontSize(12.5).fontColor(DIM).margin({ top: 4 })
              }
              .padding(16).backgroundColor(PANEL).borderRadius(14).width('100%')
              .onClick(() => {
                AppStorage.setOrCreate('currentDeviceId', Number(d.id));
                router.pushUrl({ url: 'pages/DeviceDetail' });
              })
            }
          }, (d: Record<string, Object>) => String(d.id))
        }.layoutWeight(1).width('100%')
      }
    }
    .width('100%').height('100%')
    .backgroundColor(BG)
    .padding({ left: 20, right: 20 })
  }
}

async function getStoreBase(ctx: Context, url: string): Promise<void> {
  const { getStore } = await import('../model/Api');
  const p = await getStore(ctx);
  p.putSync('base_url', url.trim().replace(/\/+$/, ''));
  p.flush();
}
