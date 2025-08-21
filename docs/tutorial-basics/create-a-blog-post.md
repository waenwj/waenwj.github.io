---
sidebar_position: 3
---

# 创建博客文章

Docusaurus 为每篇博客文章创建 **页面**，还提供 **博客索引页面**、**标签系统**、**RSS** 订阅...

## 创建你的第一篇文章

在 `blog/2021-02-28-greetings.md` 创建文件：

```md title="blog/2021-02-28-greetings.md"
---
slug: greetings
title: 问候！
authors:
  - name: Joel Marcey
    title: Docusaurus 1 联合创始人
    url: https://github.com/JoelMarcey
    image_url: https://github.com/JoelMarcey.png
  - name: Sébastien Lorber
    title: Docusaurus 维护者
    url: https://sebastienlorber.com
    image_url: https://github.com/slorber.png
tags: [greetings]
---

恭喜，你已经发布了第一篇文章！

请随意修改和编辑这篇文章。
```

新博客文章现在可以在 [http://localhost:3000/blog/greetings](http://localhost:3000/blog/greetings) 访问。
