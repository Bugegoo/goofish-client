# 贡献指南

感谢你对 Goofish Client 的关注！我们欢迎并感谢任何形式的贡献。

## 🤝 如何贡献

### 报告问题

如果你发现了 Bug 或有功能建议：

1. **搜索现有问题** - 首先检查 [GitHub Issues](https://github.com/11273/goofish-client/issues) 中是否已有相似问题
2. **创建新 Issue** - 如果没有找到，请创建新的 Issue 并提供：
   - 清晰的问题描述
   - 复现步骤
   - 预期行为和实际行为
   - 环境信息（Node.js 版本、操作系统等）
   - 相关的错误日志或截图

### 提交代码

#### 准备工作

1. **Fork 项目** - 在 GitHub 上 Fork [goofish-client](https://github.com/11273/goofish-client)
2. **克隆代码** - 将你的 Fork 克隆到本地：
   ```bash
   git clone https://github.com/YOUR_USERNAME/goofish-client.git
   cd goofish-client
   ```
3. **安装依赖**：
   ```bash
   npm install
   ```

#### 开发流程

1. **创建分支** - 为你的功能或修复创建新分支：

   ```bash
   git checkout -b feature/YOUR_USERNAME/your-feature-name
   # 或
   git checkout -b fix/YOUR_USERNAME/your-bug-fix
   ```

2. **开发和测试**：

   ```bash
   # 启动开发模式
   npm run dev

   # 检查代码格式
   npm run lint
   ```

3. **提交变更**：
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

#### 提交规范

我们使用 [Conventional Commits](https://conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档更新
- `style:` 代码格式调整（不影响功能）
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建工具、辅助工具等

#### Pull Request

1. **推送分支**：

   ```bash
   git push origin feature/your-feature-name
   ```

2. **创建 PR** - 在 GitHub 上创建 Pull Request，包含：
   - 清晰的标题和描述
   - 变更内容说明
   - 相关 Issue 的引用
   - 测试说明

## 📝 文档贡献

### 改进现有文档

- 修正错误或更新过时信息
- 改善示例代码
- 增加使用场景说明

### 添加新文档

- API 使用示例
- 最佳实践指南
- 故障排除指南

## 🛠️ 开发环境

### 系统要求

- Node.js 20.19.0+（开发与发布工具要求；库本身仍支持 Node.js 14+）
- npm（仓库使用 package-lock.json）

### 项目结构

```
goofish-client/
├── src/              # 源代码
│   ├── client/       # 客户端主类
│   ├── services/     # 服务层
│   ├── types/        # TypeScript 类型定义
│   └── utils/        # 工具函数
├── docs/             # 文档
├── examples/         # 示例代码
└── tests/            # 测试文件
```

### 开发命令

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建项目
npm run build

# 代码检查
npm run lint

# 格式化代码
npm run format

# 启动文档服务
npm run docs:dev

# 构建文档
npm run docs:build
```

## 📋 代码规范

### TypeScript

- 使用严格的 TypeScript 配置
- 为公共 API 提供完整的类型定义
- 避免使用 `any` 类型

### 代码风格

- 使用 ESLint 和 Prettier 进行代码格式化
- 遵循项目现有的命名约定
- 保持一致的代码风格

### 注释规范

````typescript
/**
 * 搜索商品
 * @param options 搜索参数
 * @returns 搜索结果
 * @example
 * ```typescript
 * const results = await client.search({
 *   keyword: "iPhone",
 *   pageNumber: 1
 * });
 * ```
 */
async search(options: SearchOptions): Promise<SearchResponse> {
  // 实现细节...
}
````

## 🎯 贡献指导

### 优先级

1. **Bug 修复** - 修复现有问题是最高优先级
2. **性能优化** - 提升 Client 性能和稳定性
3. **新功能** - 添加有价值的新功能
4. **文档改进** - 完善文档和示例

### 建议的贡献领域

- 添加更多 API 接口支持
- 改进错误处理机制
- 优化网络请求性能
- 增加更多使用示例
- 完善类型定义

## 🔄 发布流程

项目维护者会定期发布新版本：

1. 代码审查和测试
2. 更新版本号和 CHANGELOG
3. 发布到 npm
4. 创建 GitHub Release

## 📞 联系我们

- **GitHub Issues** - 报告问题和功能请求
- **GitHub Discussions** - 技术讨论和交流
- **Email** - 紧急问题联系

## 📄 许可证

通过贡献代码，你同意你的贡献将在 [GPL-3.0](https://github.com/11273/goofish-client/blob/main/LICENSE) 许可证下发布。

---

再次感谢你的贡献！每一个贡献都让 Goofish Client 变得更好。 🎉
