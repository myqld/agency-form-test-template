export type CentralizedTestUser = {
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
};

export type LoginProvider = 'MYID' | 'QDI';

export type LoginIdentity = {
  provider: LoginProvider;
  email: string;
};

// Source: screenshot-provided test data.
export const screenshotTestUsers: CentralizedTestUser[] = [
  { firstName: 'MICHAEL', lastName: 'BLACK', dob: '1/10/1935', email: 'michael.black@fake.com.au' },
  { firstName: 'DEBRA', lastName: 'WARD', dob: '1/03/1925', email: 'debra.ward@fake.com.au' },
  { firstName: 'MICHAEL', lastName: 'WEST', dob: '1/01/1939', email: 'michael.west@fake.com.au' },
  { firstName: 'AMANDA', lastName: 'EVANS', dob: '1/12/1927', email: 'amanda.evans@fake.com.au' },
  { firstName: 'AMANDA', lastName: 'MORRISON', dob: '1/02/1925', email: 'amanda.morrison@fake.com.au' },
  { firstName: 'DAVID', lastName: 'PEARSON', dob: '1/08/1933', email: 'david.pearson@fake.com.au' },
  { firstName: 'DAVID', lastName: 'ADAMSON', dob: '1/11/1931', email: 'david.adamson@fake.com.au' },
  { firstName: 'DAVID', lastName: 'JONES', dob: '1/11/1923', email: 'david.jones@fake.com.au' },
  { firstName: 'STEPHANIE', lastName: 'HERALD', dob: '1/05/1927', email: 'stephanie.herald@fake.com.au' },
  { firstName: 'Brian', lastName: 'Caravan', dob: '26/02/1993', email: 'IndustryRDTI26@test.gov.au' },
  { firstName: 'Brie', lastName: 'Lesson', dob: '27/02/1993', email: 'IndustryRDTI27@test.gov.au' },
  { firstName: 'Michael', lastName: 'Schute', dob: '28/02/1993', email: 'IndustryRDTI28@test.gov.au' },
];


const emailBySpecFile: Record<string, string> = {
  'BYSMandatoryCheck.spec.ts': 'michael.black@fake.com.au',
  'MyselfContactMandatoryCheck.spec.ts': 'debra.ward@fake.com.au',
  'ParentContactMandatoryCheck.spec.ts': 'michael.west@fake.com.au',
  'MyselfContactsPLG.spec.ts': 'amanda.evans@fake.com.au',
  'MyselfContactsSFM.spec.ts': 'amanda.morrison@fake.com.au',
  'MyselfContactsFO.spec.ts': 'david.pearson@fake.com.au',
  'ParentContactsPLG.spec.ts': 'david.adamson@fake.com.au',
  'ParentContactsSFM.spec.ts': 'david.jones@fake.com.au',
  'ParentContactsFO.spec.ts': 'stephanie.herald@fake.com.au',
  'MyselfContact1.spec.ts': 'IndustryRDTI26@test.gov.au',
  'ParentContact1.spec.ts': 'IndustryRDTI27@test.gov.au',
  'ApplicantNS.spec.ts': 'IndustryRDTI28@test.gov.au',
  'ApplicantMyselfMandatoryCheck.spec.ts': 'michael.black@fake.com.au',
  'ApplicantParentMandatoryCheck.spec.ts': 'debra.ward@fake.com.au',
  'MyselfApplicant.spec.ts': 'michael.west@fake.com.au',
  'ParentApplicant.spec.ts': 'michael.west@fake.com.au',
  'DisabilityMandatoryCheck.spec.ts': 'amanda.morrison@fake.com.au',
  'HPMandatoryCheck.spec.ts': 'david.pearson@fake.com.au',
  'ReviewParent2Contacts.spec.ts': 'IndustryRDTI27@test.gov.au',
  'ReviewMyself2Contacts.spec.ts': 'IndustryRDTI28@test.gov.au',
};

const qdiIp2EmailBySpecFile: Record<string, string> = {
  'MyselfContact1.spec.ts': 'ictassurance+qdi11@smartservice.qld.gov.au',
};

const getQdiIp2Email = (accountNumber: number): string => {
  return `ictassurance+qdi${accountNumber}@smartservice.qld.gov.au`;
};

const parseProvider = (value?: string): LoginProvider | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'MYID' || normalized === 'QDI') {
    return normalized;
  }
  return undefined;
};

export const getMappedMyIdEmail = (specFileName: string): string | undefined => {
  return emailBySpecFile[specFileName];
};

export const getDefaultMyIdEmail = (specFileName: string): string => {
  const mappedEmail = getMappedMyIdEmail(specFileName);
  if (mappedEmail) {
    return mappedEmail;
  }

  throw new Error(`No centralized myID email is mapped for spec: ${specFileName}`);
};

export const getMyIdEmail = (specFileName: string): string => {
  if (process.env.E2E_MYID_EMAIL) {
    return process.env.E2E_MYID_EMAIL;
  }

  const mappedEmail = getMappedMyIdEmail(specFileName);
  if (mappedEmail) {
    return mappedEmail;
  }

  if (process.env.E2E_TEST_USER_EMAIL) {
    return process.env.E2E_TEST_USER_EMAIL;
  }

  throw new Error(`No mapped myID email for spec: ${specFileName}`);
};

export const getMyIdUser = (specFileName: string): CentralizedTestUser | undefined => {
  const email = getMyIdEmail(specFileName).toLowerCase();
  return screenshotTestUsers.find((u) => u.email.toLowerCase() === email);
};

export const getLoginIdentityForSpec = (specFileName: string): LoginIdentity => {
  const provider = parseProvider(process.env.E2E_LOGIN_PROVIDER) ?? 'MYID';

  if (process.env.E2E_LOGIN_EMAIL) {
    return { provider, email: process.env.E2E_LOGIN_EMAIL };
  }

  if (provider === 'QDI') {
    const mappedQdiEmail = qdiIp2EmailBySpecFile[specFileName];
    if (mappedQdiEmail) {
      return { provider, email: mappedQdiEmail };
    }

    const qdiIp2Account = Number.parseInt(process.env.E2E_QDI_IP2_ACCOUNT ?? '', 10);
    if (Number.isInteger(qdiIp2Account) && qdiIp2Account >= 11 && qdiIp2Account <= 20) {
      return { provider, email: getQdiIp2Email(qdiIp2Account) };
    }

    // Fall back to general email mapping for QDI if available
    const mappedEmail = getMappedMyIdEmail(specFileName);
    if (mappedEmail) {
      return { provider, email: mappedEmail };
    }

    throw new Error(
      `No QDI IP2 email is mapped for spec: ${specFileName}. Set E2E_LOGIN_EMAIL or E2E_QDI_IP2_ACCOUNT (11-20).`
    );
  }

  return { provider, email: getMyIdEmail(specFileName) };
};
