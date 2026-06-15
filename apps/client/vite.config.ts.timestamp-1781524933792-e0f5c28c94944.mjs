// vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "file:///Users/alessandro/Desktop/Personal/game/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.42_lightningcss@1.32.0/node_modules/vite/dist/node/index.js";
import react from "file:///Users/alessandro/Desktop/Personal/game/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@20.19.42_lightningcss@1.32.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///Users/alessandro/Desktop/Personal/game/node_modules/.pnpm/@tailwindcss+vite@4.3.0_vite@5.4.21_@types+node@20.19.42_lightningcss@1.32.0_/node_modules/@tailwindcss/vite/dist/index.mjs";
import { sentryVitePlugin } from "file:///Users/alessandro/Desktop/Personal/game/node_modules/.pnpm/@sentry+vite-plugin@5.3.0_rollup@4.61.1/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
var __vite_injected_original_import_meta_url = "file:///Users/alessandro/Desktop/Personal/game/apps/client/vite.config.ts";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sentryToken = env.SENTRY_AUTH_TOKEN;
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...sentryToken ? [
        sentryVitePlugin({
          org: env.SENTRY_ORG || "game-fh",
          project: env.SENTRY_PROJECT || "game-client",
          authToken: sentryToken,
          // Delete the emitted .map files after upload so they aren't served
          // from the CDN (the bundle still uploads fine to Sentry first).
          sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] }
        })
      ] : []
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)) }
    },
    server: {
      port: 5173,
      host: true
    },
    preview: {
      port: 4173,
      host: true
    },
    build: {
      target: "es2022",
      sourcemap: true
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvYWxlc3NhbmRyby9EZXNrdG9wL1BlcnNvbmFsL2dhbWUvYXBwcy9jbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9hbGVzc2FuZHJvL0Rlc2t0b3AvUGVyc29uYWwvZ2FtZS9hcHBzL2NsaWVudC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvYWxlc3NhbmRyby9EZXNrdG9wL1BlcnNvbmFsL2dhbWUvYXBwcy9jbGllbnQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAnbm9kZTp1cmwnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHRhaWx3aW5kY3NzIGZyb20gJ0B0YWlsd2luZGNzcy92aXRlJztcbmltcG9ydCB7IHNlbnRyeVZpdGVQbHVnaW4gfSBmcm9tICdAc2VudHJ5L3ZpdGUtcGx1Z2luJztcblxuLy8gYGxvYWRFbnYobW9kZSwgY3dkLCAnJylgIHJlYWRzIC5lbnYgZmlsZXMgKGxvY2FsIGRldikgQU5EIHJlYWwgcHJvY2Vzcy5lbnZcbi8vIHZhcnMgKENJIC8gVmVyY2VsKSB3aXRoIG5vIHByZWZpeCBmaWx0ZXIsIHNvIFNFTlRSWV9BVVRIX1RPS0VOIGlzIGZvdW5kIGluXG4vLyBib3RoIHBsYWNlcyBcdTIwMTQgVml0ZSBkb2VzIE5PVCBwdXQgLmVudiB2YWx1ZXMgaW50byBwcm9jZXNzLmVudiBmb3IgdGhlIGNvbmZpZy5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpLCAnJyk7XG5cbiAgLy8gVXBsb2FkIHNvdXJjZSBtYXBzIHRvIFNlbnRyeSBvbiBgdml0ZSBidWlsZGAsIHNvIHByb2R1Y3Rpb24gc3RhY2sgdHJhY2VzXG4gIC8vIHNob3cgb3JpZ2luYWwgVFMgaW5zdGVhZCBvZiBtaW5pZmllZCBidW5kbGUgY29kZS4gQWN0aXZlIG9ubHkgd2hlbiBhbiBhdXRoXG4gIC8vIHRva2VuIGlzIHByZXNlbnQ7IGJ1aWxkcyB3aXRob3V0IGl0IChtb3N0IGxvY2FsIGRldikganVzdCBza2lwIHRoZSB1cGxvYWQuXG4gIC8vIE1hcHMgbWF0Y2ggZXZlbnRzIHZpYSBkZWJ1ZyBJRHMsIHNvIG5vIHJlbGVhc2UgY29vcmRpbmF0aW9uIGlzIG5lZWRlZC5cbiAgY29uc3Qgc2VudHJ5VG9rZW4gPSBlbnYuU0VOVFJZX0FVVEhfVE9LRU47XG5cbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbXG4gICAgICByZWFjdCgpLFxuICAgICAgdGFpbHdpbmRjc3MoKSxcbiAgICAgIC4uLihzZW50cnlUb2tlblxuICAgICAgICA/IFtcbiAgICAgICAgICAgIHNlbnRyeVZpdGVQbHVnaW4oe1xuICAgICAgICAgICAgICBvcmc6IGVudi5TRU5UUllfT1JHIHx8ICdnYW1lLWZoJyxcbiAgICAgICAgICAgICAgcHJvamVjdDogZW52LlNFTlRSWV9QUk9KRUNUIHx8ICdnYW1lLWNsaWVudCcsXG4gICAgICAgICAgICAgIGF1dGhUb2tlbjogc2VudHJ5VG9rZW4sXG4gICAgICAgICAgICAgIC8vIERlbGV0ZSB0aGUgZW1pdHRlZCAubWFwIGZpbGVzIGFmdGVyIHVwbG9hZCBzbyB0aGV5IGFyZW4ndCBzZXJ2ZWRcbiAgICAgICAgICAgICAgLy8gZnJvbSB0aGUgQ0ROICh0aGUgYnVuZGxlIHN0aWxsIHVwbG9hZHMgZmluZSB0byBTZW50cnkgZmlyc3QpLlxuICAgICAgICAgICAgICBzb3VyY2VtYXBzOiB7IGZpbGVzVG9EZWxldGVBZnRlclVwbG9hZDogWycuL2Rpc3QvKiovKi5tYXAnXSB9LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXVxuICAgICAgICA6IFtdKSxcbiAgICBdLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7ICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpIH0sXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIHBvcnQ6IDUxNzMsXG4gICAgICBob3N0OiB0cnVlLFxuICAgIH0sXG4gICAgcHJldmlldzoge1xuICAgICAgcG9ydDogNDE3MyxcbiAgICAgIGhvc3Q6IHRydWUsXG4gICAgfSxcbiAgICBidWlsZDoge1xuICAgICAgdGFyZ2V0OiAnZXMyMDIyJyxcbiAgICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgICB9LFxuICB9O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTJVLFNBQVMscUJBQXFCO0FBQ3pXLFNBQVMsY0FBYyxlQUFlO0FBQ3RDLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUN4QixTQUFTLHdCQUF3QjtBQUo2SyxJQUFNLDJDQUEyQztBQVMvUCxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFNM0MsUUFBTSxjQUFjLElBQUk7QUFFeEIsU0FBTztBQUFBLElBQ0wsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLE1BQ1osR0FBSSxjQUNBO0FBQUEsUUFDRSxpQkFBaUI7QUFBQSxVQUNmLEtBQUssSUFBSSxjQUFjO0FBQUEsVUFDdkIsU0FBUyxJQUFJLGtCQUFrQjtBQUFBLFVBQy9CLFdBQVc7QUFBQTtBQUFBO0FBQUEsVUFHWCxZQUFZLEVBQUUsMEJBQTBCLENBQUMsaUJBQWlCLEVBQUU7QUFBQSxRQUM5RCxDQUFDO0FBQUEsTUFDSCxJQUNBLENBQUM7QUFBQSxJQUNQO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUCxPQUFPLEVBQUUsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUMsRUFBRTtBQUFBLElBQ2pFO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUjtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLElBQ1I7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxJQUNiO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
