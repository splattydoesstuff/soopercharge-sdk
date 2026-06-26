1. pnpm first
2. 执行层的东西（比如生成代码这件事，尽量交给 codex 去执行，review 则交给 子 agent），主 agent 调度完成任务
3. 在执行长期任务时，将进度更新到 progress.md，每当有阶段性结论，可以清理 progress.md 中的部分产物，落地到 docs/
4. 需要的环境变量在 .env