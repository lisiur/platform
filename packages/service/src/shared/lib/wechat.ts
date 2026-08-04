import { HTTPException } from "hono/http-exception";

const CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";

export interface Code2SessionParams {
  appid: string;
  secret: string;
  js_code: string;
}

export interface Code2SessionResult {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export async function code2Session(
  params: Code2SessionParams,
): Promise<Code2SessionResult> {
  const url = new URL(CODE2SESSION_URL);
  url.searchParams.set("appid", params.appid);
  url.searchParams.set("secret", params.secret);
  url.searchParams.set("js_code", params.js_code);
  url.searchParams.set("grant_type", "authorization_code");

  const res = await fetch(url.toString());
  const data = (await res.json()) as Code2SessionResult;

  if (data.errcode) {
    throw new HTTPException(401, {
      message: `WeChat error: ${data.errmsg ?? "code2session failed"}`,
    });
  }

  if (!data.openid) {
    throw new HTTPException(401, {
      message: "WeChat did not return an openid",
    });
  }

  return data;
}
