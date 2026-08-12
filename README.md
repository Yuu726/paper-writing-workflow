# 论文写作工作流网站

这是一个无需安装依赖的静态网站。页面按 6 个阶段、17 个工作表重新组织三个 Excel 的 313 个非空单元格，并为每个单元格提供独立的复制按钮。

## 打开方式

直接双击 `index.html` 即可使用；也可以在本目录运行：

```bash
python3 -m http.server 8000
```

然后访问 `http://127.0.0.1:8000`。

## 内容原则

- 网站展示和复制的是原始 Excel 单元格文字。
- 复制按钮只复制对应单元格原文，不包含坐标、字段标签或界面文字。
- 页面增加的阶段标题、来源定位和阅读说明只用于导航，不会写入复制内容。
- 三个源 Excel 和已有 Word 文件不会被修改。

## 重新生成数据

`data/workflow-data.js` 是静态数据文件。若需要从同结构的工作簿 XML 提取结果重新生成，可运行：

```bash
python3 scripts/build_data.py --source-dir /path/to/extracted-json --output data/workflow-data.js
```
