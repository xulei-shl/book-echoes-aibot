1. 加快首屏渲染速度。Hero 组件不要使用 motion 动画，不要用 LazyImage 懒加载图片，而是应该第一时间渲染出内容，减少 LCP（最大内容绘制） 延时。

2. 减少图片体积。图片资源尽量用 CDN 地址，如果必须要放在同域名的 /imgs 目录下，记得用 tinypng 压缩一下图片，减少图片体积。

3. 增强网页无障碍性。给只有图标没有文字内容的 <a> / <button> 等标签加上 aria-label 属性，增强网页 Accessibility 评分。

4. 优化字体加载速度。引入自定义字体时加上  display: 'swap'; preload: true 两个属性，告诉浏览器优先下载自定义字体，下载完替换默认字体，消除渲染阻塞。

5. 缓存静态资源。在 public/_headers 和 next.config.mjs 文件针对 /imgs/* 等静态资源配置自定义缓存策略，比如：Cache-Control: public,max-age=31536000,immutable，让 CDN 明确知道需要缓存多久，实现零延迟加载。

6. 缓存静态页面。在 Next.js 项目中，通过增量静态生成（ISR）来缓存页面路由文件，在页面对应的 page.tsx 文件头部加上 export const revalidate = 3600; 告诉 Worker，一小时内不重复生成此页面。

7. 适配多语言缓存。在引入 next-intl 做多语言的情况，浏览器会通过 Set-Cookie 设置用户偏好的语言，这种行为会让 Worker 认为网站是动态的，影响 ISR 的生成逻辑。因此，需要在中间件逻辑里面，对不涉及登录态的公共路由加上  intlResponse.headers.delete('Set-Cookie'); 保证多语言场景下可以正常缓存静态页面。

8. 配置 CDN 缓存。默认情况下，Cloudflare 的 CDN 会缓存特定后缀的静态资源，比如字体、图片等，不会缓存网页。要让 Next.js 项目中配置了 export const revalidate = 3600; 的 page.tsx 能被 CDN 缓存，需要在 Cloudflare 配置 Cache Rules，可以选择 Cache everything 模板，TTL 选择尊重源站，这样 CDN 就只会缓存有自定义 Cache-Control 响应头的页面。

9. 优化服务端渲染。服务端渲染涉及数据操作时，会影响网页指标的 LCP 和 Speed Index，可以把多个操作用 await Promise.all 包裹起来并行处理，降低响应延时。

10. 配置数据缓存。通过 unstable_cache，revalidateTag 配置数据缓存，比如把频繁读库的 getConfigs 缓存到内存/kv，加快数据读取速度。