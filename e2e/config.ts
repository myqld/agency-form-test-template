import * as dotenv from "dotenv";
import * as process from "process";
import { z } from "zod";

dotenv.config();

const Env = z.object({
    TC_SERVICE_BASE_URL: z.string().url(),
    DTP_ROOT_URL: z.string().url(),
    E2E_DTP_FORM_NAME: z.string(),
    E2E_DTP_GAPI_URL: z.string().url(),
    E2E_TEST_RUNNER_ENV: z.enum(["local", "dev", "syst", "uat", "preprod"]),
    E2E_TEST_RUNNER_CLIENT_ID: z.string(),
    E2E_TEST_RUNNER_CLIENT_SECRET: z.string(),
    E2E_TEST_USER_EMAIL: z.string().email(),
    E2E_TEST_RUNNER_PASSWORD: z.string(),
    E2E_TEST_USER_IDS: z.string(),
    E2E_SUBSCRIBER_CLIENT_ID: z.string(),
    E2E_SUBSCRIBER_CLIENT_SECRET: z.string(),
    ATTACHMENT_S3_BUCKET_URL: z.string().url(),
    AF_ROOT_URL: z.string().url(),
    AF_E2E_TEST_USER_IDS: z.string(),
    AGENCY_NAME: z.string(),
    E2E_AF_TRANSACTION_ID: z.string(),
});

const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.invalid_type) {
        return {
            message: `\n${issue.path[0]}: expected: ${issue.expected}, received: ${issue.received}`,
        };
    }

    if (issue.code === z.ZodIssueCode.invalid_string) {
        return {
            message: `\n${issue.path[0]}: is not a valid ${issue.validation}`,
        };
    }
    return { message: `\n${ctx.defaultError}` };
};

const _environmentParsing = Env.safeParse(process.env, {
    errorMap: customErrorMap,
});
if (!_environmentParsing.success) {
    const errorMessages = _environmentParsing.error.issues.map((issue) => issue.message);
    throw new Error("Invalid environment variables" + errorMessages);
}

export const config = { ..._environmentParsing.data };
