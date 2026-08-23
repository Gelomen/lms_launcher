@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "LLAMA_CPP_DIR=.\llama-cpp"
set "MODELS_DIR=.\Models"

@REM :: 切换到 llama-cpp 目录（根据实际修改）
@REM cd /d ".\llama-cpp" || (
@REM     echo 无法切换到目录 llama-cpp
@REM     pause
@REM     exit /b
@REM )

:: ---------- 列出主模型并让用户选择（循环，支持输入0退出） ----------
:main_model_loop
echo.
echo 1. 选择主模型
echo ------------------------------------------------------------
set "COUNT=0"
echo 正在扫描主模型 .gguf 文件（排除 mmproj）...
echo.
for %%f in ("%MODELS_DIR%\*.gguf") do (
    set "filename=%%~nxf"
    if "!filename:mmproj=!"=="!filename!" (
        set /a COUNT+=1
        set "MODEL_LIST[!COUNT!]=!filename!"
        echo [!COUNT!] !filename!
    )
)
if %COUNT% equ 0 (
    echo 在 %MODELS_DIR% 中未找到任何主模型 .gguf 文件。
    pause
    exit /b
)

echo [0] 取消并退出
echo.
set /p "CHOICE=请输入要启动的主模型编号 (输入0退出): "

if "!CHOICE!"=="0" (
    echo 已取消操作。
    pause
    exit /b
)

set "VALID="
for /l %%i in (1,1,%COUNT%) do (
    if "!CHOICE!"=="%%i" set "VALID=1"
)
if defined VALID (
    set "MODEL_FILE=!MODEL_LIST[%CHOICE%]!"
    echo 选中的主模型: !MODEL_FILE!
    goto :main_model_selected
) else (
    echo 无效的编号，请重新选择。
    echo.
    goto :main_model_loop
)

:main_model_selected

:: ---------- 列出视觉模型并让用户选择（循环，支持输入0退出）----------
:select_mmproj
echo.
echo 2. 选择视觉模型
echo ------------------------------------------------------------
set "MMPROJ_FLAG="
echo 正在扫描 mmproj 文件（文件名含 "mmproj"）...
set "MMPROJ_COUNT=0"
for %%f in ("%MODELS_DIR%\*mmproj*.gguf") do (
    set /a MMPROJ_COUNT+=1
    set "MMPROJ_LIST[!MMPROJ_COUNT!]=%%~nxf"
)
if !MMPROJ_COUNT! equ 0 (
    echo 未找到任何 mmproj 文件，将不使用 --mmproj 参数。
    goto :skip_mmproj
)

:mmproj_loop
echo.
echo 可用的 mmproj 文件列表：
for /l %%i in (1,1,!MMPROJ_COUNT!) do (
    echo [%%i] !MMPROJ_LIST[%%i]!
)
echo [0] 取消使用 mmproj
set /p "MMPROJ_CHOICE=请输入要使用的 mmproj 文件编号 (输入0取消): "

if "!MMPROJ_CHOICE!"=="0" (
    echo 已取消使用 mmproj。
    set "MMPROJ_FLAG="
    goto :skip_mmproj
)

set "MMPROJ_VALID="
for /l %%i in (1,1,!MMPROJ_COUNT!) do (
    if "!MMPROJ_CHOICE!"=="%%i" set "MMPROJ_VALID=1"
)
if defined MMPROJ_VALID (
    set "MMPROJ_FILE=!MMPROJ_LIST[%MMPROJ_CHOICE%]!"
    set "MMPROJ_FLAG=--mmproj %MODELS_DIR%\!MMPROJ_FILE!"
    echo 已选择 mmproj: !MMPROJ_FILE!
    goto :skip_mmproj
) else (
    echo 无效编号，请重新选择。
    goto :mmproj_loop
)

:skip_mmproj

:: ---------- 手动选择 spec-type（带智能建议） ----------
echo.
echo 3. 选择推测解码类型
echo ------------------------------------------------------------
set "RECOMMENDED="
set "SPEC_TYPE="

:: 检测模型文件名是否包含关键词，设置建议值（仅用于显示，不自动赋值）
echo !MODEL_FILE! | findstr /i "mtp" >nul
if not errorlevel 1 set "RECOMMENDED=draft-mtp"

echo !MODEL_FILE! | findstr /i "dspark" >nul
if not errorlevel 1 set "RECOMMENDED=draft-dspark"

echo.
echo 请选择推测解码类型（--spec-type）：
if defined RECOMMENDED (
    echo 根据模型名称建议使用: !RECOMMENDED!
) else (
    echo 未检测到明确关键词，建议使用 none 或手动选择。
)
echo   [1] draft-mtp
:: echo   [2] draft-dspark
echo   [0] 取消指定解码类型
set /p "spec_choice=请输入数字 (1/0，直接回车将使用建议值): "

if "!spec_choice!"=="1" set "SPEC_TYPE=draft-mtp"
:: if "!spec_choice!"=="2" set "SPEC_TYPE=draft-dspark"
if "!spec_choice!"=="0" set "SPEC_TYPE=none"

:: 如果用户直接回车且存在建议值，则采用建议值
if not defined SPEC_TYPE (
    if defined RECOMMENDED (
        set "SPEC_TYPE=!RECOMMENDED!"
        echo 未提供有效输入，已采用建议值: !SPEC_TYPE!
    ) else (
        set "SPEC_TYPE=none"
        echo 未提供有效输入，已设为 none。
    )
)

set "COMMON=-ngl 999 -fa on --load-mode mmap -np 1 -c 180224 -b 1024 -ub 512 -t 8 -tb 8 -ctk q8_0 -ctv q8_0 --jinja --chat-template-file %MODELS_DIR%\chat_template.jinja --reasoning-format deepseek --reasoning-effort low --spec-draft-n-max 4 --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0.01 --presence_penalty 0.0 --repeat_penalty 1.05 --port 9931"

:: ---------- 组装动态参数 ----------
set "DYNAMIC=-m %MODELS_DIR%\!MODEL_FILE!"
if defined MMPROJ_FLAG set "DYNAMIC=!DYNAMIC! !MMPROJ_FLAG! --image-min-tokens 1024"
set "DYNAMIC=!DYNAMIC! --spec-type !SPEC_TYPE!"

:: ---------- 启动服务 ----------
echo.
echo 启动命令: llama-server.exe %DYNAMIC% %COMMON%
%LLAMA_CPP_DIR%\llama-server.exe %DYNAMIC% %COMMON%

pause

:: ---------- 公共参数 ----------
:: -c 131072                                                                                    上下文窗口大小, 131072 = 128K
:: --n-cpu-moe 0                                                                                模型不是 MoE 用不上
:: --load-mode <mlock/mmap>                                                                     -ngl 999, 用不上 mlock, 实测 mmap 显存占用更少, 速度更快
:: -t 8 -tb 8                                                                                   根据 CPU 设置, 13700K(8 P核, 8 E核, 24 线程) 用 P核数量, 因为 2 个线程竞争同一缓存和内存通道, 总带宽不变, 但同步开销增加反而可能更慢
:: -b 1024                                                                                      根据显存设置
:: -ub 512                                                                                      根据显存设置
:: --reasoning <off/on>                                                                         开关思考
:: --reasoning-effort low                                                                       思考更聪明, 但打开又过度思考, 选 low
:: --reasoning-format deepseek                                                                  使用 deepseek 推理格式
:: --reasoning-preserve                                                                         保留对话里历史的推理, 优点: 保留历史推理记忆, 缺点: 占用上下文窗口
:: --reasoning-budget 6000                                                                      限制思考的最大 tokens
:: --reasoning-budget-message "[Budget reached: 做最终输出的推理总结]"                            达到思考最大限制时的提示词
:: ------------------------------
:: --metrics                                                                                    调试用, Prometheus 数据监控
:: --fit on --fit-ctx 128000 --fit-target 1024                                                  调试用, 当不设置 -c 而让其自动填充, 上下文至少 128000, 要求填充后显存预留 1G
