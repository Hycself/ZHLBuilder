// 与 packages/cli/package.json 的 bin 名保持一致：bin 已经是 zhlbuilder，
// 这里还说 zcode 会让 doctor 输出和 ps/任务管理器里的进程名与用户实际敲的命令对不上。
export const CLI_COMMAND_NAME = "zhlbuilder";
export const CLI_PROCESS_NAME = "zhlbuilder-cli";

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};
