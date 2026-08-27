# 用 PostgreSQL，而非需求文档指定的 sqlite

原始技术栈写的是 sqlite，但埋点表（页面浏览、点击）随访问量线性增长，且明细要保留半年，sqlite 单文件在这个量级上的查询与 `VACUUM` 会变得难受。中途曾定为 MariaDB，调查后发现 Drizzle 官方支持列表不含 MariaDB，只能借 mysql2 驱动走 MySQL 方言，`drizzle-kit` 的 introspect 与迁移生成在边界情况上没有官方保证，因此改用 Drizzle 支持最成熟的 PostgreSQL。

## Consequences

- 驱动跟随工作区先例 `multi_line_bot`，用 `postgres`（postgres.js）而非 `pg`，走 `drizzle-orm/postgres-js`。
- `docker-compose` 多一个 postgres 服务、一份 volume 与 healthcheck，备份不再是「拷一个文件」，需要 `pg_dump` 流程。
