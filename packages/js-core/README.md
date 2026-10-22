# Forms Browser JS Library

[![npm package](/)](/)
[![MIT License](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Please see [Forms Docs](/).
Specifically, [Quickstart/Implementation details](/).

## What is Forms

Forms is your go-to solution for in-product micro-surveys that will supercharge your product experience! 🚀 For more information please check out [forms.com](/).

## How to use this library

1. Install the Forms package inside your project using npm:

```bash
npm install -s @forms/js
```

2. Import Forms and initialize the widget in your main component (e.g., App.tsx or App.js):

```javascript
import forms from "@forms/js";

if (typeof window !== "undefined") {
  forms.setup({
    workspaceId: "your-workspace-id",
    appUrl: "/",
  });
}
```

Replace your-environment-id with your actual environment ID. You can find your environment ID in the **Setup Checklist** in the Forms settings.

For more detailed guides for different frameworks, check out our [Framework Guides](/).
