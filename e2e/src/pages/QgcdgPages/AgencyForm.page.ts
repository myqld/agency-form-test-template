import { Locator, Page } from "@playwright/test";
import { config } from "../../../config";
import { AgencyFormPage } from "../AgencyForm.page";
import { DraftModalSection } from "../sections/DraftModal.section";
import { ApplicationTypePage } from "./ApplicationType.page";
import { ContactDetailsPage } from "./ContactDetails.page";
import { DeclarationPage } from "./Declaration.page";
import { PersonalDetailsPage } from "./PersonalDetails.page";
import { ReviewPage } from "./Review.page";
import { EligibilityPage } from "./Eligibility.page";
import { NewComponentTestingPage } from "./NewComponentTesting.page";
import { ConfirmationPage } from "./Confirmation.page";

export class QGCDGFormPage extends AgencyFormPage {
    readonly stepTitle: Locator;
    prefillPageNumber = 0;
    TRANSACTION_NAME =  config.E2E_DTP_FORM_NAME;
    AF_TRANSACTION_NAME = config.E2E_AF_TRANSACTION_ID  ;
    PAGE_URL = `${config.DTP_ROOT_URL}/${this.TRANSACTION_NAME}/agency-form`;
    AF_PAGE_URL = `${config.AF_ROOT_URL}/${this.AF_TRANSACTION_NAME}/form`;
    eligibilityPage: EligibilityPage;
    typeOfApplicationPage: ApplicationTypePage;
    personalDetailsPage: PersonalDetailsPage;
    contactDetailsPage: ContactDetailsPage;
    newComponentTestingPage: NewComponentTestingPage;
    reviewPage: ReviewPage;
    declarationPage: DeclarationPage;
    confirmationPage: ConfirmationPage;

    readonly draftModal: DraftModalSection;

    constructor(page: Page) {
        super(page);

        this.stepTitle = page.locator(".step.current");
        this.eligibilityPage = new EligibilityPage(page);
        this.typeOfApplicationPage = new ApplicationTypePage(page);
        this.personalDetailsPage = new PersonalDetailsPage(page);
        this.contactDetailsPage = new ContactDetailsPage(page);
        this.reviewPage = new ReviewPage(page);
        this.declarationPage = new DeclarationPage(page);
        this.newComponentTestingPage = new NewComponentTestingPage(page);
        this.confirmationPage = new ConfirmationPage(page);

        this.draftModal = new DraftModalSection(page);
    }

    async goToQgcdgForm(isAssistedForms = false) {
        if (!this.TRANSACTION_NAME) {
            throw new Error("Qgcdg transaction name not set");
        }
        if (isAssistedForms) {
            await super.goToAgencyForm(this.AF_PAGE_URL);
            return;
        }
        await super.goToAgencyForm(this.PAGE_URL);
    }
}
