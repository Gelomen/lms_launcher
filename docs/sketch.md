# 启动器

## 愿景

我想要将当前的 run.bat 脚本改造成一个界面化, 有UI界面配置, 并且生成不同的启动参数配置模板的工具, 由用户选择某个模板来启动 llama-server

## 思路

1. 暂且命名: lms_launcher (使用什么技术还不确定, 但要轻量)
2. 启动后, 可以关闭窗口, 保留在任务栏图标
3. 界面里, 分为多个模块
4. 模块1: 设置 llama.cpp 安装目录
5. 模块2: 管理 llama-server 启动参数模板
6. llama-server 启动参数模板: 允许用户创建多个模板
    - 有个添加模板按钮, 点开后, 弹出窗口
    - 窗口内显示 llama-server 的 `参数名: 输入框` 列表, 取消按钮和保存按钮
    - 这些常用的参数是读取 lms_launcher 同目录下的 `llama_params.yaml` 里配置的参数
    - 这个文件只能手动修改, 它是一个模板, 也就是默认标准
    - `llama_params.yaml` 模板内格式大概:
        ```yaml
        params:                                 // 参数的key和实际使用的命令对应
            m: "-m"
            mmproj: "--mmproj"
            ngl: "-ngl"
            fa: "-fa"
            np: "-np"
            c: "-c"
            reasoningEffort: '--reasoning-effort'
            ...

        required:                               // 必填项
            - m
        ```
    - 创建模板的时候, 先将 `llama_params.yaml` 这些配置好的参数读出来, 展示到弹出创建模板窗口的列表里
    - 窗口还有模板id输入框, 唯一id, 小字母英文字符, 不包括空格
    - 用户依次填写参数, 点击保存的时候, 要校验模板名字是否为空并且唯一
    - 保存后, 也在 lms_launcher 同目录下, 生成模板配置文件 `llama_launch_configs.yaml`
    - `llama_launch_configs.yaml` 包含多套用户保存的不同配置(配置名字唯一)
        - 配置格式大概如下:
            ```yaml
            config_1:                           // 用户输入的唯一id, 小字母英文字符, 不包括空格
                desc: "xxx"                     // 描述, 备注等
                m: "..\Qwen3.8-27B-MTP.gguf"
                ...
                reasoningEffort: "low"

            ```
        - 必填项没有填时, 不给保存, 并将对应输入框外框变红 (如模板id 和 -m 参数)
        - 其他参数没有填的, 不保存到 `llama_launch_configs.yaml` 里
        - 用户在界面上点击修改按钮的时候, 要将这个配置和 `llama_params.yaml` 结合, 有填的展示, 没填的依然留空
7. 有个启动按钮, 按钮的旁边有个下拉菜单, 点击后展开, 内容就是 `llama_launch_configs.yaml` 里配置的每个 id
8. 选择某个 id, 点击启动, 将这些配置的参数对应的命令和参数值拼接, 使用 llama-server 启动服务
9. 模块3, 界面下方有个区域, 显示 llama-server 运行时的日志(只能看, 选择和复制, 不能修改, 会自动滚动)
10. 启动按钮在启动后, 状态随着 llama-server 变化:
    - llama-server 进程存在, 按钮改变颜色, 按钮文字描述没错 停止
    - llama-server 进程不存在, 按钮恢复默认状态
    - 点击 停止 按钮, 结束 llama-server 进程


## 要求

- 目前还是个大概的思路
- 使用 superpowers skill 帮忙分析
- 我想做轻量点的, 最好最后成品是个可执行程序, 而不需求去执行命令来启动这个启动器
- 使用的技术你帮我分析下
- 这个启动器的实现, 你也帮我分析下
- 出一份分析文档到当前目录的 docs/ 下
