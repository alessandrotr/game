// vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "file:///C:/Users/M/Desktop/game/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.42_lightningcss@1.32.0/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/M/Desktop/game/node_modules/.pnpm/@vitejs+plugin-react@4.7.0__35271957ac81ce76a0b495b0f4055683/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/M/Desktop/game/node_modules/.pnpm/@tailwindcss+vite@4.3.0_vit_6fabcb24e709aff4547fb11b9d7ac373/node_modules/@tailwindcss/vite/dist/index.mjs";
import { sentryVitePlugin } from "file:///C:/Users/M/Desktop/game/node_modules/.pnpm/@sentry+vite-plugin@5.3.0_rollup@4.61.1/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
var __vite_injected_original_import_meta_url = "file:///C:/Users/M/Desktop/game/apps/client/vite.config.ts";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxNXFxcXERlc2t0b3BcXFxcZ2FtZVxcXFxhcHBzXFxcXGNsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcTVxcXFxEZXNrdG9wXFxcXGdhbWVcXFxcYXBwc1xcXFxjbGllbnRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL00vRGVza3RvcC9nYW1lL2FwcHMvY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJztcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSc7XHJcbmltcG9ydCB7IHNlbnRyeVZpdGVQbHVnaW4gfSBmcm9tICdAc2VudHJ5L3ZpdGUtcGx1Z2luJztcclxuXHJcbi8vIGBsb2FkRW52KG1vZGUsIGN3ZCwgJycpYCByZWFkcyAuZW52IGZpbGVzIChsb2NhbCBkZXYpIEFORCByZWFsIHByb2Nlc3MuZW52XHJcbi8vIHZhcnMgKENJIC8gVmVyY2VsKSB3aXRoIG5vIHByZWZpeCBmaWx0ZXIsIHNvIFNFTlRSWV9BVVRIX1RPS0VOIGlzIGZvdW5kIGluXHJcbi8vIGJvdGggcGxhY2VzIFx1MjAxNCBWaXRlIGRvZXMgTk9UIHB1dCAuZW52IHZhbHVlcyBpbnRvIHByb2Nlc3MuZW52IGZvciB0aGUgY29uZmlnLlxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XHJcbiAgY29uc3QgZW52ID0gbG9hZEVudihtb2RlLCBwcm9jZXNzLmN3ZCgpLCAnJyk7XHJcblxyXG4gIC8vIFVwbG9hZCBzb3VyY2UgbWFwcyB0byBTZW50cnkgb24gYHZpdGUgYnVpbGRgLCBzbyBwcm9kdWN0aW9uIHN0YWNrIHRyYWNlc1xyXG4gIC8vIHNob3cgb3JpZ2luYWwgVFMgaW5zdGVhZCBvZiBtaW5pZmllZCBidW5kbGUgY29kZS4gQWN0aXZlIG9ubHkgd2hlbiBhbiBhdXRoXHJcbiAgLy8gdG9rZW4gaXMgcHJlc2VudDsgYnVpbGRzIHdpdGhvdXQgaXQgKG1vc3QgbG9jYWwgZGV2KSBqdXN0IHNraXAgdGhlIHVwbG9hZC5cclxuICAvLyBNYXBzIG1hdGNoIGV2ZW50cyB2aWEgZGVidWcgSURzLCBzbyBubyByZWxlYXNlIGNvb3JkaW5hdGlvbiBpcyBuZWVkZWQuXHJcbiAgY29uc3Qgc2VudHJ5VG9rZW4gPSBlbnYuU0VOVFJZX0FVVEhfVE9LRU47XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICBwbHVnaW5zOiBbXHJcbiAgICAgIHJlYWN0KCksXHJcbiAgICAgIHRhaWx3aW5kY3NzKCksXHJcbiAgICAgIC4uLihzZW50cnlUb2tlblxyXG4gICAgICAgID8gW1xyXG4gICAgICAgICAgICBzZW50cnlWaXRlUGx1Z2luKHtcclxuICAgICAgICAgICAgICBvcmc6IGVudi5TRU5UUllfT1JHIHx8ICdnYW1lLWZoJyxcclxuICAgICAgICAgICAgICBwcm9qZWN0OiBlbnYuU0VOVFJZX1BST0pFQ1QgfHwgJ2dhbWUtY2xpZW50JyxcclxuICAgICAgICAgICAgICBhdXRoVG9rZW46IHNlbnRyeVRva2VuLFxyXG4gICAgICAgICAgICAgIC8vIERlbGV0ZSB0aGUgZW1pdHRlZCAubWFwIGZpbGVzIGFmdGVyIHVwbG9hZCBzbyB0aGV5IGFyZW4ndCBzZXJ2ZWRcclxuICAgICAgICAgICAgICAvLyBmcm9tIHRoZSBDRE4gKHRoZSBidW5kbGUgc3RpbGwgdXBsb2FkcyBmaW5lIHRvIFNlbnRyeSBmaXJzdCkuXHJcbiAgICAgICAgICAgICAgc291cmNlbWFwczogeyBmaWxlc1RvRGVsZXRlQWZ0ZXJVcGxvYWQ6IFsnLi9kaXN0LyoqLyoubWFwJ10gfSxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgOiBbXSksXHJcbiAgICBdLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICBhbGlhczogeyAnQCc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9zcmMnLCBpbXBvcnQubWV0YS51cmwpKSB9LFxyXG4gICAgfSxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBwb3J0OiA1MTczLFxyXG4gICAgICBob3N0OiB0cnVlLFxyXG4gICAgfSxcclxuICAgIHByZXZpZXc6IHtcclxuICAgICAgcG9ydDogNDE3MyxcclxuICAgICAgaG9zdDogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBidWlsZDoge1xyXG4gICAgICB0YXJnZXQ6ICdlczIwMjInLFxyXG4gICAgICBzb3VyY2VtYXA6IHRydWUsXHJcbiAgICB9LFxyXG4gIH07XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlTLFNBQVMscUJBQXFCO0FBQ3ZVLFNBQVMsY0FBYyxlQUFlO0FBQ3RDLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUN4QixTQUFTLHdCQUF3QjtBQUowSixJQUFNLDJDQUEyQztBQVM1TyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFNM0MsUUFBTSxjQUFjLElBQUk7QUFFeEIsU0FBTztBQUFBLElBQ0wsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLE1BQ1osR0FBSSxjQUNBO0FBQUEsUUFDRSxpQkFBaUI7QUFBQSxVQUNmLEtBQUssSUFBSSxjQUFjO0FBQUEsVUFDdkIsU0FBUyxJQUFJLGtCQUFrQjtBQUFBLFVBQy9CLFdBQVc7QUFBQTtBQUFBO0FBQUEsVUFHWCxZQUFZLEVBQUUsMEJBQTBCLENBQUMsaUJBQWlCLEVBQUU7QUFBQSxRQUM5RCxDQUFDO0FBQUEsTUFDSCxJQUNBLENBQUM7QUFBQSxJQUNQO0FBQUEsSUFDQSxTQUFTO0FBQUEsTUFDUCxPQUFPLEVBQUUsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUMsRUFBRTtBQUFBLElBQ2pFO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUjtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLElBQ1I7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxJQUNiO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
