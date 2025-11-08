import districts from "school-districts";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false });

// the function is intentionally anonymous, because you probably want to wrap it
// (eg use monoidentity's getLoginRecognized() and relog)
export default async (
  { email, password }: { email: string; password: string },
  onInvalidAuth: () => never,
  methodName: string,
  params: Record<string, string> = {},
  specificFetch: (
    url: string,
    args: {
      method: string;
      body: URLSearchParams;
      headers: Record<string, string>;
    },
  ) => Promise<Response> = fetch,
) => {
  const domain = email.split("@")[1];
  const district = districts[domain];
  if (!district) {
    throw new Error("Unknown district");
  }
  const base = district.apps.find((a) => a.app == "StudentVue")?.base;
  if (!base) {
    throw new Error("District does not use StudentVue");
  }

  const userID = email.split("@")[0];

  const request = new URLSearchParams({
    userID,
    password,
    skipLoginLog: "true",
    parent: "false",
    webServiceHandleName: "PXPWebServices",
    methodName,
    paramStr: `<Parms>${Object.keys(params)
      .map((key) => `<${key}>${params[key]}</${key}>`)
      .join("")}</Parms>`,
  });

  const response = await specificFetch(
    `${base}/Service/PXPCommunication.asmx/ProcessWebServiceRequest`,
    {
      method: "POST",
      body: request,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "fast-studentvue",
      },
    },
  );
  const dataWrap = await response.text();
  const dataChunked = dataWrap.split(
    `<string xmlns="http://edupoint.com/webservices/">`,
  );
  if (dataChunked.length != 2) {
    throw new Error(
      `StudentVue error: malformed response (status ${response.status})`,
      {
        cause: dataWrap,
      },
    );
  }
  const data = dataChunked[1]
    .split("</string>")[0]
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  const xml = parser.parse(data);
  const err: string | undefined = xml.RT_ERROR?.["@_ERROR_MESSAGE"];
  if (err) {
    if (err.startsWith("Invalid user id or password")) {
      onInvalidAuth();
    }
    throw new Error(`StudentVue error: ${err}`);
  }

  return xml;
};
