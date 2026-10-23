import { scanBarcode, scanCore } from '@kit.ScanKit';
import { common } from '@kit.AbilityKit';

/**
 * 扫码绑定（ScanKit 默认扫码界面）。
 *
 * 二维码内容契约（规格 §七）：{"app":"zhlbuilder","server":"...","pairCode":"XXXXXXXX"}，
 * 必须校验 app 字段；server 非空时说明本机该连哪台中枢。
 */

export interface ZhlPairQr {
  app?: string;
  server?: string;
  pairCode?: string;
}

/** 拉起扫码界面，返回二维码原始文本；用户取消时 reject */
export function zhlStartPairScan(context: common.UIAbilityContext): Promise<string> {
  const options: scanBarcode.ScanOptions = {
    scanTypes: [scanCore.ScanType.QR_CODE],
    enableMultiMode: false,
    enableAlbum: false,
  };
  return scanBarcode.startScanForResult(context, options)
    .then((result: scanBarcode.ScanResult): string => result.originalValue);
}

/** 解析并校验配对二维码；不是 ZHLBuilder 的码一律返回 undefined */
export function zhlParsePairQr(raw: string): ZhlPairQr | undefined {
  try {
    const parsed: ZhlPairQr = JSON.parse(raw) as ZhlPairQr;
    if (parsed.app !== 'zhlbuilder') {
      return undefined;
    }
    const code: string = parsed.pairCode ?? '';
    if (code.length === 0) {
      return undefined;
    }
    return parsed;
  } catch (e) {
    return undefined;
  }
}