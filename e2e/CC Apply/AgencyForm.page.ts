import { expect, Locator, Page } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { LoginProvider } from "../../tests/test-data/centralizedTestData";
import environment from "../../tests/config/environment";

const companionCardApplyUrl = process.env.DTP_ROOT_URL 
  ? `${process.env.DTP_ROOT_URL}/companioncardapply`
  : "https://forms.preprod.beta.my.qld.gov.au/companioncardapply";

type UploadFileOptions = {
    file: {
        name: string;
        mimeType: string;
        buffer: Buffer;
    };
};

export class AgencyFormPage {
    readonly page: Page;
    readonly beginButton: Locator;
    readonly continueWithMyIdButton: Locator;
    readonly continueWithQdiButton: Locator;
    readonly selectMyIdButton: Locator;
    readonly selectQdiButton: Locator;
    readonly myIdEmailTextBox: Locator;
    readonly qdiEmailTextBox: Locator;
    readonly qdiPasswordTextBox: Locator;
    readonly qdiOneTimeCodeTextBox: Locator;
    readonly genericContinueButton: Locator;
    readonly remindMeLaterButton: Locator;
    readonly cancelButton: Locator;
    readonly getCodeButton: Locator;
    readonly rememberConsentCheckBox: Locator;
    readonly shareDetailsConsentCheckBox: Locator;
    readonly consentButton: Locator;
    readonly saveAndContinueButton: Locator;
    private loadingIssueDetected = false;
    private lastMyIdEmail = "";
    private lastLoginProvider: LoginProvider = "MYID";
    private lastLoginEmail = "";

    constructor(page: Page) {
        this.page = page;
        this.beginButton = page.getByRole("button", { name: "Begin" });
        this.continueWithMyIdButton = page.getByRole("button", { name: "Continue with myID" });
        this.continueWithQdiButton = page.getByRole("button", { name: /continue with qdi|continue with qgov ?id|continue with queensland/i });
        this.selectMyIdButton = page.getByRole("button", { name: "Select myID" });
        this.selectQdiButton = page.getByRole("button", { name: /select qdi|select qgov ?id/i });
        this.myIdEmailTextBox = page.getByRole("textbox", { name: "myID email" });
        this.qdiEmailTextBox = page.getByRole("textbox", { name: /email address|qdi email|qgov ?id email|email/i }).first();
        this.qdiPasswordTextBox = page.getByRole("textbox", { name: /password/i }).first();
        this.qdiOneTimeCodeTextBox = page.getByRole("textbox", { name: /one-?time code|enter your one-time code/i }).first();
        this.genericContinueButton = page.getByRole("button", { name: /^continue$/i }).first();
        this.remindMeLaterButton = page.getByRole("button", { name: /remind me later/i }).first();
        this.cancelButton = page.getByRole("button", { name: /^cancel$/i }).first();
        this.getCodeButton = page.getByRole("button", { name: "Get code" });
        this.rememberConsentCheckBox = page.getByLabel(/yes,?\s*remember my consent/i);
        this.shareDetailsConsentCheckBox = page.getByLabel(/i consent to shar(?:e|ing) these details/i);
        this.consentButton = page.getByRole("button", { name: /^Consent$/i });
        this.saveAndContinueButton = page.getByRole("button", { name: "Save and continue" });

        page.on("response", (response) => {
            if (response.request().isNavigationRequest() && response.status() >= 400) {
                this.loadingIssueDetected = true;
            }
        });

    }

    // Watches for the "Can't find draft" modal concurrently with an action.
    // If the modal appears, clicks "Start new", waits for Before You Start, then throws DraftDeleted.
    async withModalWatch<T>(action: () => Promise<T>): Promise<T> {
        let actionDone = false;
        const modal = this.page.locator('dtf-modal[title="Can\'t find draft"]');

        const modalWatcher = (async (): Promise<T> => {
            while (!actionDone) {
                const visible = await modal.isVisible().catch(() => false);
                if (visible) {
                    await modal.getByRole("button", { name: "Start new" }).click({ force: true });
                    await this.page.getByRole("heading", { name: /before you start/i })
                        .waitFor({ state: "visible", timeout: 30000 });
                    throw new Error("DraftDeleted");
                }
                await new Promise(r => setTimeout(r, 300));
            }
            return undefined as unknown as T;
        })();

        return Promise.race([
            action().then(result => { actionDone = true; return result; }),
            modalWatcher,
        ]).finally(() => { actionDone = true; });
    }

    async goToCompanionCardApply() {
        await this.page.goto(companionCardApplyUrl);
    }

    async beginApplication() {
        await this.beginButton.waitFor({ state: "visible", timeout: 15000 });
        await this.beginButton.click();
    }

    async continueWithMyId() {
        await this.continueWithMyIdButton.waitFor({ state: "visible", timeout: 15000 });
        await this.continueWithMyIdButton.click();
    }

    async selectMyId() {
        await this.selectMyIdButton.waitFor({ state: "visible", timeout: 15000 });
        await this.selectMyIdButton.click();
    }

    async enterMyIdEmail(emailAddress: string) {
        this.lastMyIdEmail = emailAddress;
        await this.myIdEmailTextBox.waitFor({ state: "visible", timeout: 30000 });
        await this.myIdEmailTextBox.fill(emailAddress);
    }

    async enterIdentityEmail(provider: LoginProvider, emailAddress: string) {
        this.lastMyIdEmail = emailAddress;
        this.lastLoginProvider = provider;
        this.lastLoginEmail = emailAddress;
        const emailBox = provider === "QDI" ? this.qdiEmailTextBox : this.myIdEmailTextBox;
        await emailBox.waitFor({ state: "visible", timeout: 30000 });
        await emailBox.fill(emailAddress);
    }

    private getRequiredEnv(variableName: string, context: string): string {
        const value = process.env[variableName];
        if (!value) {
            throw new Error(`${context} requires ${variableName} to be set.`);
        }
        return value;
    }

    private getFirstDefinedEnv(...variableNames: string[]): string | undefined {
        for (const variableName of variableNames) {
            const value = process.env[variableName];
            if (value) {
                return value;
            }
        }
        return undefined;
    }

    private getFirstDefinedEnvWithSource(...variableNames: string[]): { value: string; source: string } | undefined {
        for (const variableName of variableNames) {
            const value = process.env[variableName];
            if (value) {
                return { value, source: `env:${variableName}` };
            }
        }
        return undefined;
    }

    private resolveQdiPassword(): string {
        const fromEnv = this.getFirstDefinedEnvWithSource(
            "E2E_QDI_PASSWORD",
            "E2E_TEST_RUNNER_PASSWORD",
            "E2E_SUBSCRIBER_CLIENT_SECRET"
        );
        const fromEnvironment =
            environment.QDI_PASSWORD
                ? { value: environment.QDI_PASSWORD, source: "environment:QDI_PASSWORD" }
                : environment.TEST_RUNNER_PASSWORD
                  ? { value: environment.TEST_RUNNER_PASSWORD, source: "environment:TEST_RUNNER_PASSWORD" }
                  : environment.SUBSCRIBER_CLIENT_SECRET
                    ? { value: environment.SUBSCRIBER_CLIENT_SECRET, source: "environment:SUBSCRIBER_CLIENT_SECRET" }
                    : environment.TEST_RUNNER_CLIENT_SECRET
                      ? { value: environment.TEST_RUNNER_CLIENT_SECRET, source: "environment:TEST_RUNNER_CLIENT_SECRET" }
                      : undefined;

        const resolved = fromEnv ?? fromEnvironment;
        if (!resolved?.value) {
            throw new Error(
                "QDI password entry requires E2E_QDI_PASSWORD (or fallback E2E_TEST_RUNNER_PASSWORD / E2E_SUBSCRIBER_CLIENT_SECRET)."
            );
        }

        console.log(`Resolved QDI password source: ${resolved.source}`);
        return resolved.value;
    }

    private resolveQdiOneTimeCode(): string | undefined {
        const fromEnv = this.getFirstDefinedEnvWithSource(
            "E2E_QDI_OTP_CODE",
            "E2E_SUBSCRIBER_CLIENT_SECRET",
            "E2E_TEST_RUNNER_PASSWORD"
        );
        const fromEnvironment =
            environment.SUBSCRIBER_CLIENT_SECRET
                ? { value: environment.SUBSCRIBER_CLIENT_SECRET, source: "environment:SUBSCRIBER_CLIENT_SECRET" }
                : environment.TEST_RUNNER_PASSWORD
                  ? { value: environment.TEST_RUNNER_PASSWORD, source: "environment:TEST_RUNNER_PASSWORD" }
                  : environment.TEST_RUNNER_CLIENT_SECRET
                    ? { value: environment.TEST_RUNNER_CLIENT_SECRET, source: "environment:TEST_RUNNER_CLIENT_SECRET" }
                    : undefined;

        const resolved = fromEnv ?? fromEnvironment;
        if (resolved?.value) {
            console.log(`Resolved QDI OTP bypass token source: ${resolved.source}`);
        } else {
            console.log("No QDI OTP bypass token was resolved.");
        }
        return resolved?.value;
    }

    private async fetchQdiOtp(): Promise<string> {
        // QDI preprod test accounts can bypass OTP by using configured secrets directly.
        const otpBypassToken = this.resolveQdiOneTimeCode();
        if (!otpBypassToken) {
            throw new Error("Unable to resolve QDI OTP bypass token from environment configuration.");
        }

        console.log("Using QDI OTP bypass token from configured secrets.");
        return otpBypassToken;
    }

    private async clickIfVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
        const visible = await locator.isVisible({ timeout: timeoutMs }).catch(() => false);
        if (!visible) {
            return false;
        }

        await locator.click();
        return true;
    }

    private async completeQdiFlowIfRequired() {
        console.log("Starting QDI login flow...");

        const hasPassword = await this.qdiPasswordTextBox.isVisible({ timeout: 5000 }).catch(() => false);
        console.log("Password field visible:", hasPassword);
        if (hasPassword) {
            const qdiPassword = this.resolveQdiPassword();
            console.log("Filling password...");
            await this.qdiPasswordTextBox.fill(qdiPassword, { timeout: 2000 });
            const clickedContinue = await this.clickIfVisible(this.genericContinueButton, 8000);
            console.log("Clicked continue after password:", clickedContinue);
            if (!clickedContinue) {
                await this.qdiPasswordTextBox.press("Enter").catch(() => {});
            }
            await this.page.waitForLoadState("domcontentloaded").catch(() => {});
        }

        let hasOtp = await this.qdiOneTimeCodeTextBox.isVisible({ timeout: 5000 }).catch(() => false);
        console.log("OTP field visible:", hasOtp);
        if (!hasOtp) {
            const clickedGetCode = await this.clickIfVisible(this.getCodeButton, 3000);
            if (clickedGetCode) {
                console.log("Clicked 'Get code' while waiting for OTP challenge.");
            }
            hasOtp = await this.qdiOneTimeCodeTextBox.isVisible({ timeout: 6000 }).catch(() => false);
            console.log("OTP field visible after wait/retry:", hasOtp);
        }

        if (hasOtp) {
            console.log("Bypassing OTP using client and subscriber secrets...");
            const qdiOtp = await this.fetchQdiOtp();
            if (qdiOtp) {
                await this.qdiOneTimeCodeTextBox.fill(qdiOtp, { timeout: 2000 });
                const clickedContinue = await this.clickIfVisible(this.genericContinueButton, 8000);
                console.log("Clicked continue after OTP:", clickedContinue);
                if (!clickedContinue) {
                    await this.qdiOneTimeCodeTextBox.press("Enter").catch(() => {});
                }
                await this.page.waitForLoadState("domcontentloaded").catch(() => {});
            } else {
                console.log("No OTP required, proceeding...");
            }
        } else {
            console.log(`QDI OTP challenge not shown. Continuing post-login handling. URL: ${this.page.url()}`);
        }

        console.log("Clicking 'Remind me later' button...");
        await this.clickIfVisible(this.remindMeLaterButton, 5000);

        for (let clickCount = 0; clickCount < 2; clickCount++) {
            console.log(`Clicking 'Cancel' button, attempt ${clickCount + 1}...`);
            const clickedCancel = await this.clickIfVisible(this.cancelButton, 2500);
            console.log("Clicked cancel:", clickedCancel);
            if (!clickedCancel) {
                break;
            }
            await this.page.waitForLoadState("domcontentloaded").catch(() => {});
        }

        console.log("QDI login flow completed.");
    }

    private async waitForVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
        try {
            await locator.waitFor({ state: "visible", timeout: timeoutMs });
            return true;
        } catch {
            return false;
        }
    }

    private async clickWhenVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
        const visible = await this.waitForVisible(locator, timeoutMs);
        if (!visible) {
            return false;
        }

        await locator.click();
        return true;
    }

    private async checkConsentCheckboxIfVisible(): Promise<boolean> {
        console.log("[CONSENT] checkConsentCheckboxIfVisible() starting...");

        // 1. Click the label element directly — handles Angular Material and similar
        //    hidden-input patterns where isVisible() returns false on the <input>
        const consentLabelCandidates: Locator[] = [
            this.page.locator('label').filter({ hasText: /i consent to shar/i }).first(),
            this.page.locator('label').filter({ hasText: /yes,?\s*remember my consent/i }).first(),
            this.page.getByText(/i consent to shar(?:e|ing) these details/i).first(),
            this.page.getByText(/yes,?\s*remember my consent/i).first(),
        ];

        for (let i = 0; i < consentLabelCandidates.length; i++) {
            const label = consentLabelCandidates[i];
            const visible = await label.isVisible({ timeout: 2000 }).catch(() => false);
            console.log(`[CONSENT] Label candidate ${i} visible:`, visible);
            if (!visible) continue;

            console.log(`[CONSENT] Clicking label candidate ${i}...`);
            await label.click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(500);

            // Check if any checkbox became checked after label click
            const anyChecked = await this.page.evaluate(() =>
                document.querySelectorAll('input[type="checkbox"]:checked').length > 0
            ).catch(() => false);
            console.log(`[CONSENT] Any checkbox checked after label click:`, anyChecked);
            if (anyChecked) return true;
        }

        // 2. Force-check the hidden input directly (bypasses visibility restriction)
        const hiddenInputCandidates: Locator[] = [
            this.rememberConsentCheckBox,
            this.shareDetailsConsentCheckBox,
            this.page.locator('input[type="checkbox"]').first(),
        ];

        for (let i = 0; i < hiddenInputCandidates.length; i++) {
            const cb = hiddenInputCandidates[i];
            const exists = await cb.count().then(c => c > 0).catch(() => false);
            console.log(`[CONSENT] Hidden input candidate ${i} exists:`, exists);
            if (!exists) continue;

            await cb.check({ force: true }).catch(() =>
                cb.click({ force: true }).catch(() => {})
            );
            await this.page.waitForTimeout(500);

            const checked = await cb.isChecked().catch(() => false);
            console.log(`[CONSENT] Hidden input candidate ${i} checked:`, checked);
            if (checked) return true;
        }

        console.log("[CONSENT] No checkbox could be successfully checked.");
        return false;
    }

    async consentIfRequired() {
        console.log("[CONSENT] consentIfRequired() started. URL:", this.page.url());

        // Wait for the SPA to finish rendering the consent form before querying elements
        await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        console.log("[CONSENT] Page settled. URL:", this.page.url());

        // Wait for either a Consent button or a Continue button to appear,
        // which signals the consent form is rendered and ready to interact with
        const consentOrContinue = await Promise.race([
            this.consentButton.waitFor({ state: "visible", timeout: 25000 }).then(() => "consent").catch(() => null),
            this.genericContinueButton.waitFor({ state: "visible", timeout: 25000 }).then(() => "continue").catch(() => null),
        ]);
        console.log("[CONSENT] Detected consent UI type:", consentOrContinue);

        if (!consentOrContinue) {
            console.log("[CONSENT] No consent-related UI detected. Assuming consent not required or already handled.");
            return;
        }

        // Check/click the consent checkbox (required before Continue is enabled)
        await this.checkConsentCheckboxIfVisible();

        if (consentOrContinue === "consent") {
            console.log("[CONSENT] Clicking Consent button...");
            await this.consentButton.click();
            await this.page.waitForURL(/companioncardapply/i, { timeout: 30000 }).catch(() => {});
            return;
        }

        // Continue button path
        let continueEnabled = await this.genericContinueButton.isEnabled().catch(() => false);
        console.log("[CONSENT] Continue button enabled:", continueEnabled);
        if (!continueEnabled) {
            await this.checkConsentCheckboxIfVisible();
            await this.page.waitForTimeout(1000);
            continueEnabled = await this.genericContinueButton.isEnabled().catch(() => false);
            console.log("[CONSENT] Continue button enabled after retry:", continueEnabled);
        }
        if (continueEnabled) {
            console.log("[CONSENT] Clicking Continue button...");
            await this.genericContinueButton.click();
            await this.page.waitForURL(/companioncardapply/i, { timeout: 30000 }).catch(() => {});
        } else {
            // Last resort: try any visible button that isn't back/cancel
            const anyProceedButton = this.page.locator('button').filter({ hasNotText: /back|cancel/i }).last();
            const anyVisible = await anyProceedButton.isVisible({ timeout: 2000 }).catch(() => false);
            if (anyVisible) {
                console.log("[CONSENT] Clicking fallback proceed button...");
                await anyProceedButton.click();
                await this.page.waitForURL(/companioncardapply/i, { timeout: 30000 }).catch(() => {});
            }
        }
    }

    async loginWithIdentity(provider: LoginProvider, emailAddress: string, options?: { navigateFromEntry?: boolean }) {
        const continueButton = provider === "QDI" ? this.continueWithQdiButton : this.continueWithMyIdButton;
        const selectButton = provider === "QDI" ? this.selectQdiButton : this.selectMyIdButton;
        const emailBox = provider === "QDI" ? this.qdiEmailTextBox : this.myIdEmailTextBox;
        this.lastLoginProvider = provider;
        this.lastLoginEmail = emailAddress;

        if (options?.navigateFromEntry) {
            await this.goToCompanionCardApply();
            if (await this.beginButton.isVisible({ timeout: 10000 }).catch(() => false)) {
                await this.beginApplication();
            }
        }

        // Run one slow, deterministic pass through the identity gateway.
        const clickedContinue = await this.clickWhenVisible(continueButton, 30000);
        if (clickedContinue) {
            await this.page.waitForLoadState("domcontentloaded").catch(() => {});
            await this.page.waitForTimeout(1500);
        }

        const clickedSelect = await this.clickWhenVisible(selectButton, 30000);
        if (clickedSelect) {
            await this.page.waitForLoadState("domcontentloaded").catch(() => {});
            await this.page.waitForTimeout(1500);
        }

        const emailVisible = await this.waitForVisible(emailBox, 45000);
        if (!emailVisible) {
            if (provider === "QDI") {
                const qdiPasswordVisible = await this.qdiPasswordTextBox.isVisible({ timeout: 1000 }).catch(() => false);
                const qdiOtpVisible = await this.qdiOneTimeCodeTextBox.isVisible({ timeout: 1000 }).catch(() => false);
                const onQdiChallengeUrl = /mfa|oauth-prep\.tmr\.qld\.gov\.au/i.test(this.page.url());
                const onCompanionCardRootUrl = /\/companioncardapply\/?$/i.test(this.page.url());
                const continueVisible = await continueButton.isVisible({ timeout: 1000 }).catch(() => false);
                const selectVisible = await selectButton.isVisible({ timeout: 1000 }).catch(() => false);

                if (qdiPasswordVisible || qdiOtpVisible || onQdiChallengeUrl) {
                    await this.completeQdiFlowIfRequired();
                    await this.consentIfRequired();
                    return;
                }

                if (onCompanionCardRootUrl && !continueVisible && !selectVisible) {
                    console.log("QDI email step not visible, but provider controls are absent on companion card root. Assuming existing authenticated session.");
                    await this.consentIfRequired();
                    return;
                }
            }

            throw new Error(
                `Could not reach ${provider} email step after login selection actions. Current URL: ${this.page.url()}`
            );
        }

        await this.enterIdentityEmail(provider, emailAddress);
        // Both QDI and MYID require Get Code → OTP → Continue before reaching consent
        await this.completeQdiFlowIfRequired();
        await this.consentIfRequired();
    }

    async navigateToAgencyFormIfNeeded() {
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});

        for (let attempt = 0; attempt < 5; attempt++) {
            const currentUrl = this.page.url();
            const isOnAgencyForm = /companioncardapply\/agency-form/i.test(currentUrl);
            const bysHeadingVisible = await this.page
                .getByRole("heading", { name: /before you start|what are you trying to do\?/i })
                .first()
                .isVisible({ timeout: 3000 })
                .catch(() => false);

            if (isOnAgencyForm && bysHeadingVisible) {
                return;
            }

            await this.resumeIdentityFlowIfVisible();

            const postResumeUrl = this.page.url();
            if (/companioncardapply\/agency-form/i.test(postResumeUrl)) {
                const postResumeBysHeadingVisible = await this.page
                    .getByRole("heading", { name: /before you start|what are you trying to do\?/i })
                    .first()
                    .isVisible({ timeout: 5000 })
                    .catch(() => false);
                if (postResumeBysHeadingVisible) {
                    return;
                }
            }

            const agencyFormUrl = process.env.DTP_ROOT_URL
              ? `${process.env.DTP_ROOT_URL}/companioncardapply/agency-form`
              : "https://forms.preprod.beta.my.qld.gov.au/companioncardapply/agency-form";
            await this.page.goto(agencyFormUrl);
            await this.page.waitForLoadState("domcontentloaded").catch(() => {});

            await this.resumeIdentityFlowIfVisible();

            const reachedBysHeading = await this.page
                .getByRole("heading", { name: /before you start|what are you trying to do\?/i })
                .first()
                .isVisible({ timeout: 7000 })
                .catch(() => false);
            if (reachedBysHeading) {
                return;
            }
        }

        throw new Error("Unable to reach Before You Start page after authentication retries.");
    }

    private async resumeIdentityFlowIfVisible() {
        const provider = this.lastLoginProvider;
        const loginHeading = this.page.getByRole("heading", { name: /login to continue/i });
        const loginToContinueVisible = await loginHeading.isVisible({ timeout: 5000 }).catch(() => false);

        if (loginToContinueVisible) {
            const continueButton = provider === "QDI" ? this.continueWithQdiButton : this.continueWithMyIdButton;
            const continueVisible = await continueButton.isVisible({ timeout: 5000 }).catch(() => false);
            if (continueVisible) {
                await continueButton.click();
            }
        }

        const selectButton = provider === "QDI" ? this.selectQdiButton : this.selectMyIdButton;
        const selectVisible = await selectButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (selectVisible) {
            await selectButton.click();
        }

        const emailBox = provider === "QDI" ? this.qdiEmailTextBox : this.myIdEmailTextBox;
        const emailVisible = await emailBox.isVisible({ timeout: 5000 }).catch(() => false);
        if (emailVisible && this.lastLoginEmail) {
            await emailBox.fill(this.lastLoginEmail);
        }

        if (provider === "QDI") {
            await this.completeQdiFlowIfRequired();
        }

        await this.consentIfRequired();
    }

    async ensureNoLoadingError() {
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});

        const loadingHeading = this.page.getByRole("heading", { name: /loading/i }).first();
        const showsLoading = await loadingHeading.isVisible().catch(() => false);
        if (showsLoading) {
            const loadingCleared = await loadingHeading.waitFor({ state: "hidden", timeout: 60000 }).then(() => true).catch(() => false);
            if (!loadingCleared) {
                console.log("Loading error");
                throw new Error("Loading error");
            }
        }

        const pageText = (await this.page.locator("body").innerText().catch(() => "")) ?? "";
        const hasKnownLoadError =
            this.loadingIssueDetected ||
            /404/.test(this.page.url()) ||
            /404|page not found|this page isn'?t working|service unavailable|too many redirects|unexpected error|bad gateway/i.test(pageText);

        if (hasKnownLoadError) {
            console.log("Loading error");
            throw new Error("Loading error");
        }
    }

    async clickSaveAndContinue() {
        await this.withModalWatch(() => this.saveAndContinueButton.click());
        await this.ensureNoLoadingError();
    }

    async expectCurrentHeading(headingName: string | RegExp) {
        await expect(this.page.getByRole("heading", { name: headingName }).first()).toBeVisible({ timeout: 60_000 });
    }

    async uploadFile(options: UploadFileOptions) {
        // Write buffer to a temp file so all browsers handle it consistently
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, options.file.name);
        fs.writeFileSync(tempFilePath, options.file.buffer);

        try {
            const uploadButton = this.page.getByRole("button", { name: "browse files" }).last();
            const [fileChooser] = await Promise.all([
                this.page.waitForEvent("filechooser"),
                uploadButton.click(),
            ]);

            await fileChooser.setFiles(tempFilePath);

            // Wait for either success or failure indicator
            const uploadSuccess = this.page.getByText(/upload complete|file uploaded|uploaded successfully/i);
            const uploadError = this.page.getByText(/unable to upload/i);

            await Promise.race([
                uploadSuccess.waitFor({ state: "visible", timeout: 30_000 }),
                uploadError.waitFor({ state: "visible", timeout: 30_000 }).then(() => {
                    throw new Error(`File upload failed: "Unable to upload file" shown for ${options.file.name}`);
                }),
            ]);
        } finally {
            fs.rmSync(tempFilePath, { force: true });
        }
    }
}
