// Gizlilik Politikası metni (tek kaynak, İngilizce asıl metin): uygulama /api/legal/privacy.json'dan okur, herkese
// açık sayfa /api/legal/privacy aynı metinden üretilir (Google Play ve Google/Facebook girişinde istenen adres).
// Şirket bilgileri kesinleşince (LLC'nin tam unvanı, eyaleti ve adresi) yalnızca COMPANY değiştirilir; metin
// değişince legal.js'deki TERMS_VERSION da artırılır (kullanıcılardan yeniden onay istenir).

export const COMPANY = {
  name: 'TR Live LLC',
  place: 'the United States of America',
  email: 'trlivedestek@proton.me',
};

const C = COMPANY;

// Bölüm: { id?, title, blocks: [{ h?: alt başlık, p: paragraf | caps: büyük harfli uyarı | list: [madde] }] }
export const PRIVACY_EN = {
  title: 'TR Live Privacy Policy',
  updatedLabel: 'Last updated',
  updated: 'November 1, 2026',
  sections: [
    {
      blocks: [
        { p: `Welcome to TR Live (the "Platform"). This Privacy Policy (the "Policy") explains what personal information we collect when you use the TR Live mobile application, our web pages and the live streaming, chat, gifting and other services offered through them (together, the "Services"), why we collect it, how we use and share it, and how we protect it. The Services are provided by ${C.name} ("TR Live", "we", "us" or "our"), a company established in ${C.place}.` },
        { p: 'Please read this Policy together with our Terms of Service and Community Guidelines. Where this Policy and the Terms of Service differ on matters of personal information, this Policy prevails.' },
        { caps: 'TR LIVE IS FOR ADULTS ONLY. YOU MUST BE AT LEAST 18 YEARS OLD (OR THE AGE OF MAJORITY WHERE YOU LIVE) TO USE THE SERVICES. IF WE FIND THAT YOU ARE UNDER THAT AGE, WE WILL CLOSE YOUR ACCOUNT AND DELETE THE PERSONAL INFORMATION IN IT.' },
        { p: 'By creating an account, signing in or using the Services, you confirm that you have read this Policy and agree to the processing of your personal information as described here.' },
        { caps: 'IF YOU DO NOT AGREE WITH THIS POLICY, PLEASE DO NOT USE THE SERVICES.' },
        { p: 'We may update this Policy from time to time because of changes to the Services or to legal requirements. If a change materially affects your rights, we will let you know through an in-app notice or pop-up and, where required, ask for your consent again. The date of the current version is shown at the top of this page.' },
        { p: 'This Policy is written in English. If we provide a translation and it conflicts with the English version, the English version prevails.' },
      ],
    },
    {
      title: '1. Information We Collect',
      blocks: [
        { h: 'Information you give us' },
        { list: [
          'Account information: username, password (never stored in readable form; it is kept as an irreversible hash) and, if you provide it, your phone number.',
          'Profile information: display name, profile photo, gender, date of birth, country and city, bio and similar details. Some of these are optional. Your city is used for the "Nearby" room filter.',
          'Content you share: room and private messages, posts, comments, photos, and live audio and video broadcasts, together with related details such as when they were created. Live broadcasts are delivered to the people present in the room at the time.',
          'Host, agency and reseller applications: if you apply to receive payments, we or your agency may ask you to verify your identity and to provide the bank or payment account details where payments should be sent.',
          'Coin records: the time, amount and content of Coins you receive and spend. If in-app purchases are offered, payment details such as card numbers are processed by the payment platform (for example, Google Play), not by us.',
          'Support and reports: messages you send to Customer Service, and reports you submit together with any attachments.',
        ] },
        { h: 'Information collected automatically' },
        { list: [
          'Device information: device model, operating system and app version, whether the device appears to be an emulator, and a random installation identifier the app creates (not a hardware identifier such as IMEI).',
          'Network information: IP address.',
          'Usage information: sign-in times, entering and leaving rooms, time spent on the microphone, gifts sent and received, searches and other in-app interactions.',
          'Error logs: technical records created when the app crashes or an action fails. These are kept in our own systems for a limited time.',
          'Location: we do not collect your precise (GPS) location. Your country and city come from what you enter in your profile.',
        ] },
        { h: 'Device permissions' },
        { list: [
          'Microphone and camera: only to send your voice and video to the room when you take a seat or go live, and to take photos when you choose to.',
          'Photos: to let you choose pictures for your profile, posts and room covers. Only the pictures you select are uploaded.',
          'Bluetooth: to play room audio through your Bluetooth headset.',
          'Music files: to find and play the songs you choose to play in a room.',
          'Notifications: for announcements, messages and the notification that keeps a minimized room playing in the background.',
        ] },
        { p: 'You can turn these permissions off at any time in your device settings; the related features will then stop working.' },
        { h: 'Information from other sources' },
        { list: [
          'If you sign in with Google or Facebook, the account identifier, name and email address that the platform shares with us, to the extent you allow.',
          'Information about you contained in other users\' reports, messages or feedback.',
        ] },
      ],
    },
    {
      title: '2. How We Use Your Information',
      blocks: [
        { p: 'We use your information to provide, operate, secure and improve the Services, in particular to:' },
        { list: [
          'create and manage your account and verify your sign-ins and device sessions;',
          'run live streaming, voice and video rooms, chat, gifts, families, PK battles, events and games;',
          'process Coin purchases, gift and Diamond balances, and host and agency earnings and payouts;',
          'enforce our Community Guidelines and detect and prevent fraud, spam, abuse and illegal content;',
          'respond to your reports and support requests;',
          'send you in-app notifications and announcements, and tell you about changes to this Policy and our terms;',
          'fix errors, produce statistics and improve the Services;',
          'comply with our legal obligations, respond to lawful requests from authorities and protect our rights.',
        ] },
        { p: 'We do not sell your personal information and we do not rent it to third parties for advertising.' },
      ],
    },
    {
      title: '3. How We Share Your Information',
      blocks: [
        { h: 'Other users' },
        { p: 'Your profile, your messages in rooms, your live broadcasts and your public posts can be seen by other users, who may record or share them. The agency you belong to and your family administrators can see the related performance and contribution information.' },
        { h: 'Our service providers' },
        { list: [
          'cloud hosting and data storage services;',
          'real-time audio and video delivery infrastructure;',
          'payment service providers (for example, Google Play).',
        ] },
        { p: 'These providers process information only on our behalf and only as needed to provide their services.' },
        { h: 'Legal reasons' },
        { p: 'We may share information in response to a court order, legal process or a lawful request from competent authorities, and where necessary to protect the rights and safety of our users, the public or TR Live (for example, to protect children or prevent fraud).' },
        { h: 'Business transfers' },
        { p: 'In a merger, acquisition or sale of assets, your information may be among the transferred assets. We will require the recipient to protect it in line with this Policy.' },
        { h: 'With your consent' },
        { p: 'Apart from the cases above, we share your information only with your consent or at your direction.' },
      ],
    },
    {
      id: 'account-deletion',
      title: '4. Your Rights and Account Deletion',
      blocks: [
        { p: 'We respect the rights you have under the laws that apply to you (for example, the EU General Data Protection Regulation, Turkey\'s Personal Data Protection Law (KVKK) and U.S. state privacy laws), including the right to:' },
        { list: [
          'access and correct your information (most of it can be viewed and edited in the app);',
          'ask us to delete your account and information;',
          'request a copy of your information, object to its processing or ask us to restrict it;',
          'withdraw consent: you can change device permissions and your privacy settings at any time.',
        ] },
        { h: 'How to delete your account' },
        { p: `In the app, go to Profile → Settings → Account & Security → Delete account (in Turkish: Profil → Ayarlar → Hesap & Güvenlik → Hesabı sil) to permanently delete your account. If you cannot access the app, email us at ${C.email} and include your username. When your account is deleted, your profile is removed and your personal information is deleted or anonymized within a reasonable period. Financial records and information we are legally required to keep are retained for the period required by law. Unused Coins and Diamonds are deleted together with the account.` },
        { p: 'You can send requests through Customer Service or by email; we may need to verify your identity. We will respond within a reasonable time.' },
      ],
    },
    {
      title: '5. Information Security and International Transfers',
      blocks: [
        { p: 'We take reasonable technical and organizational measures to protect your information against unauthorized access, loss and misuse, including irreversible password hashing, session verification, access restrictions and audit logs. However, no transmission over the internet can be guaranteed to be completely secure.' },
        { p: 'Do not share your password with anyone. If you think someone has accessed your account without permission, contact us immediately.' },
        { p: `${C.name} is established in ${C.place}, and the Services may run on servers in different countries. Your information may therefore be transferred outside the country where you live. When this happens, we apply the safeguards required by applicable law (such as contractual commitments) to keep your information adequately protected.` },
      ],
    },
    {
      title: '6. Minors',
      blocks: [
        { caps: 'WE DO NOT PROVIDE THE SERVICES TO ANYONE UNDER 18 AND WE DO NOT KNOWINGLY COLLECT THEIR PERSONAL INFORMATION.' },
        { p: `If we learn that someone under 18 is using the Services, we will close the account and delete the information. If you believe your child is using TR Live, please tell us at ${C.email}. Our child safety principles are described on our Child Safety page.` },
      ],
    },
    {
      title: '7. A Note About What You Share',
      blocks: [
        { p: 'You are free to chat with other users on TR Live, but we recommend that you do not share information that could be misused, such as phone numbers, home addresses, bank or card details or ID numbers, in your profile, messages or broadcasts.' },
        { caps: 'SHARING SENSITIVE INFORMATION SUCH AS YOUR RELIGIOUS BELIEFS, HEALTH, SEX LIFE OR ETHNIC ORIGIN IS ENTIRELY YOUR CHOICE. IF YOU MAKE IT PUBLIC, YOU AGREE TO ITS PROCESSING.' },
        { p: 'Remember that messages, photos and broadcasts you share in public areas can be viewed, recorded and shared by others. You are responsible for the information you choose to share with others.' },
      ],
    },
    {
      title: '8. Contact Us',
      blocks: [
        { p: `If you have questions about this Policy or your personal information, write to Customer Service in the app or email ${C.email}.` },
        { p: `Data controller: ${C.name}, ${C.place}.` },
      ],
    },
  ],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Herkese açık HTML sayfası (mağaza kaydı ve sosyal giriş ayarları için). */
export function privacyHtml(doc = PRIVACY_EN) {
  const blocks = (bs) => bs.map((b) => {
    if (b.h) return `<h3>${esc(b.h)}</h3>`;
    if (b.caps) return `<p class="caps">${esc(b.caps)}</p>`;
    if (b.list) return `<ul>${b.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<p>${esc(b.p)}</p>`;
  }).join('\n');
  const body = doc.sections.map((s) => `<section${s.id ? ` id="${esc(s.id)}"` : ''}>${s.title ? `<h2>${esc(s.title)}</h2>` : ''}\n${blocks(s.blocks)}</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:24px 18px 48px;line-height:1.6;color:#1d1d1f;background:#fff}
h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:28px 0 8px}h3{font-size:16px;margin:18px 0 6px}.upd{color:#666;font-size:14px}.caps{font-weight:600}li{margin:4px 0}</style>
</head><body><h1>${esc(doc.title)}</h1><div class="upd">${esc(doc.updatedLabel)}: ${esc(doc.updated)}</div>
${body}
</body></html>`;
}
