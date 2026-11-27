import { config } from "./config";
import { querySubscriptionsAndSubscribe } from "./src/api/subscriber/querySubscriptionsAndSubscribe";
import { getSubscriberClient } from "./src/api/client/client";

const transactionIds = [config.E2E_DTP_FORM_NAME, config.E2E_AF_TRANSACTION_ID];

const globalSetup = async () => {
    try {
        const e2eSubscriberClient = await getSubscriberClient();
        await querySubscriptionsAndSubscribe(e2eSubscriberClient, config.E2E_SUBSCRIBER_CLIENT_ID, transactionIds);
    } catch (error) {
        console.error("Error occurred when trying to setup E2E test subscriptions", error);
        return;
    }
};

export default globalSetup;
