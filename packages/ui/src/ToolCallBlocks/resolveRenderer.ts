// 界面自研重写 v2（A1）：注册表搬进 next-agent/，本文件只剩导出点——调用点不变。
export {
  resolveToolCallRenderer,
  TOOL_RENDERER_REGISTRY,
  type ToolCallRenderer,
  type ToolRendererEntry,
} from "@/next-agent/toolRendererRegistry.js";