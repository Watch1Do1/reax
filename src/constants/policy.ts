export const TERMS_VERSION = "1.0";
export const PRIVACY_VERSION = "1.0";
export const POLICY_EFFECTIVE_DATE = "September 10, 2026";

export interface PolicySection {
  title: string;
  content: string | string[];
}

export const TERMS_OF_SERVICE_SECTIONS: PolicySection[] = [
  {
    title: "Acceptance of Terms",
    content: "By accessing or using getreax.com and related services (\"Reax\"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use Reax."
  },
  {
    title: "Minimum Age",
    content: "You must be at least 13 years old to use Reax. By creating an account or using the service, you represent and warrant that you meet this age requirement."
  },
  {
    title: "Your Content",
    content: "You retain ownership of the photos, videos, audio, text, and media you upload to Reax. You must have the necessary rights and permissions to post any content you share. You must not post illegal, hateful, harassing, sexually explicit involving minors, defamatory, or infringing material."
  },
  {
    title: "License to Us",
    content: "You grant Reax a non-exclusive, worldwide, royalty-free license to host, store, cache, display, reproduce, and distribute your content across the service solely for the operation, demonstration, and improvement of Reax threads and reactions."
  },
  {
    title: "Remix & Reaction Functionality",
    content: "By posting content on Reax, you understand that other users may create reactions, responses, remixes, and derivative content that references your original post. This functionality is a core feature of the platform."
  },
  {
    title: "Accounts & Security",
    content: "You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. We may reclaim usernames or remove accounts that violate these terms. Guest sessions and anonymous posts are also bound by these community rules."
  },
  {
    title: "Account Enforcement & Moderation",
    content: [
      "We maintain community standards to ensure a safe, creative, and respectful environment. We reserve the right to take moderation action at our sole discretion, including:",
      "• Content removal",
      "• Account suspension",
      "• Account termination",
      "for reasons including, but not limited to, spam, abuse, harassment, copyright violations, or illegal activity."
    ]
  },
  {
    title: "Copyright Complaints (DMCA)",
    content: "If you believe content on Reax infringes your copyright, contact support@getreax.com with details of the alleged infringement. We may remove content while reviewing claims and may suspend repeat infringers."
  },
  {
    title: "Privacy Reference",
    content: "Your use of Reax is also governed by our Privacy Policy, which is incorporated into these terms by reference."
  },
  {
    title: "No Warranty",
    content: "Reax is provided on an \"as is\" and \"as available\" basis without warranties of any kind, either express or implied. Uninterrupted uptime, bug-free operation, and permanent media storage are not guaranteed."
  },
  {
    title: "Limitation of Liability",
    content: "To the fullest extent permitted by law, Reax and its operators shall not be liable for any indirect, incidental, or consequential damages, or for any user-generated content or data loss resulting from use of the service."
  },
  {
    title: "Changes to Terms",
    content: "We may update these terms from time to time. When we make material changes, we will update the version number and require you to review and re-accept the updated terms to continue using your account. Continued use of Reax constitutes acceptance of the updated terms."
  },
  {
    title: "Contact",
    content: "If you have questions regarding these Terms, contact us at support@getreax.com."
  }
];

export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    title: "Introduction",
    content: "Reax (\"we\", \"us\", or \"our\") operates getreax.com. This Privacy Policy describes how we collect, use, process, and protect your personal information when you use our web application."
  },
  {
    title: "What We Collect",
    content: [
      "We collect information necessary to provide the service:",
      "• Email address and password hash if you create an account",
      "• Username and optional profile details you select",
      "• Content you post: photos, short video clips, captions, and recorded voice notes",
      "• Guest / anonymous session identifiers if you interact without an account",
      "• Policy acceptance records (version numbers and timestamps) to document agreement",
      "• Basic technical and log data required to secure and operate the service (browser type, error logs, and abuse prevention telemetry)"
    ]
  },
  {
    title: "What Is Public",
    content: "Loops, reactions, captions, and voice clips that you post are public. Other community members can view, reply to, save, and remix them in the app."
  },
  {
    title: "How We Use Your Information",
    content: "We use your data to operate Reax, display feeds and conversational threads, store media, send authentication emails, prevent spam and abuse, enforce our terms, and improve product performance. We do not sell your personal information."
  },
  {
    title: "Service Providers",
    content: "We use third-party providers for hosting, authentication, storage, email delivery, and other infrastructure necessary to run Reax. These providers process data only to provide services to Reax."
  },
  {
    title: "Data Retention",
    content: "We may retain account information, logs, and content for as long as reasonably necessary to operate the service, prevent abuse, resolve disputes, and comply with legal obligations."
  },
  {
    title: "Artificial Intelligence (AI)",
    content: "Reax does not transmit your private posts to external paid AI models for profiling or ad targeting. Optional on-device browser speech synthesis may read captions you typed. If we introduce server-side AI features in the future, we will update this policy accordingly."
  },
  {
    title: "Storage & Security",
    content: "Media is hosted on secured cloud storage infrastructure. Local browser preferences (such as saved custom reactions and drafts) reside on your device. While we strive to protect your data, permanent media archival is not guaranteed."
  },
  {
    title: "Your Choices & Rights",
    content: "You may delete your own clips within the application at any time. You may also request account deletion or data removal by contacting support@getreax.com. You may discontinue using the service at any time."
  },
  {
    title: "Children's Privacy",
    content: "Reax is not directed to children under 13 years of age. You must be at least 13 years old to use Reax. We do not knowingly collect personal information from children under 13."
  },
  {
    title: "Policy Changes",
    content: "We may update this Privacy Policy periodically. When policy versions change, users are prompted to review and re-accept the updated version before accessing their account. Continued use after changes indicates acceptance."
  },
  {
    title: "Contact Us",
    content: "For privacy questions, data requests, or concerns, please contact support@getreax.com."
  }
];
