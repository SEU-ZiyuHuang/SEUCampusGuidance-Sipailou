export default {
  fetch() {
    const config = {
      tencentMapKey: process.env.TENCENT_MAP_KEY || "",
      agentEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
      model: "deepseek-v4-flash",
      version: (process.env.VERCEL_GIT_COMMIT_SHA || "vercel").slice(0, 7),
    };
    return new Response(`window.APP_CONFIG=${JSON.stringify(config)};`, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
