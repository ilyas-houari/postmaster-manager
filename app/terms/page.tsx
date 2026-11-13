export const metadata = {
  title: "Terms of Service | Postmaster Manager",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0b1120] px-5 py-12 text-slate-200">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="border-b border-white/10 pb-8">
          <a href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to Postmaster Manager
          </a>
          <h1 className="mt-6 text-4xl font-bold text-white">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Last updated: November 13, 2026
          </p>
        </header>

        {[
          {
            title: "1. About the Service",
            text: "Postmaster Manager is a web application created by Ilyas Houari that helps users manage domains through Google Postmaster Tools.",
          },
          {
            title: "2. Account Authorization",
            text: "Users must sign in with their own Google Account and authorize the permissions required to use Google Postmaster Tools. Users are responsible for maintaining the security of their accounts.",
          },
          {
            title: "3. Authorized Use",
            text: "You may use this service only to manage domains that you own or are authorized to administer. You must comply with applicable laws and Google's terms and policies.",
          },
          {
            title: "4. Domain Operations",
            text: "The application can add domains, retrieve DNS verification records, request domain verification, and remove domains from Google Postmaster Tools. Users are responsible for reviewing their requests before performing operations.",
          },
          {
            title: "5. Service Availability",
            text: "The service depends on Google APIs and hosting providers. Availability, features, and functionality may change or be interrupted.",
          },
          {
            title: "6. Limitation of Liability",
            text: "The service is provided on an as-is basis to the extent permitted by applicable law. The developer does not guarantee uninterrupted or error-free operation.",
          },
          {
            title: "7. Changes",
            text: "These terms may be updated as the service evolves. Updated terms will be published on this page.",
          },
          {
            title: "8. Contact",
            text: "For questions about this service, contact the developer using the support email listed on the Google OAuth consent screen.",
          },
        ].map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              {section.title}
            </h2>
            <p className="leading-7 text-slate-300">{section.text}</p>
          </section>
        ))}

        <footer className="border-t border-white/10 pt-6 text-center text-sm text-slate-500">
          Postmaster Manager · Created by Ilyas Houari
        </footer>
      </article>
    </main>
  );
}
