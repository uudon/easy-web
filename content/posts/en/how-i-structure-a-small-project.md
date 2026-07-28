---
title: "How I structure a small project so it does not become messy too quickly"
summary: "Small projects often become chaotic not because they are large, but because they start without boundaries."
date: "2026-04-23"
locale: "en"
category: "programming"
slug: "how-i-structure-a-small-project"
originalPath: "/en/topics/programming/how-i-structure-a-small-project"
---

Small projects often become chaotic not because they are large, but because they start without boundaries.

The main idea is simple:

- keep page concerns separate from shared logic
- avoid early abstraction
- make the entry points obvious
- optimize for the second and third round of changes, not just the first implementation
