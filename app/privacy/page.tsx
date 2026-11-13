export const metadata = {
  title: "Privacy Policy | Postmaster Manager",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b1120] px-5 py-12 text-slate-200">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="border-b border-white/10 pb-8">
          <a href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to Postmaster Manager
          </a>
          <h1 className="mt-6 text-4xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-400">
            Last updated: November 13, 2026
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
          <p>
            Postmaster Manager is a web application created by Ilyas Houari
            to help users manage their domains through Google Postmaster Tools.
            This policy explains how information is accessed and used.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. Google Account Access</h2>
          <p>
            Users sign in using Google OAuth. With their permission,
            the application accesses Google Postmaster Tools to add domains,
            retrieve DNS verification records, verify domains, and remove
            domains from Postmaster Tools.
          </p>
          <p>
            Google account permissions are used only to provide these
            user-requested features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Information Processed</h2>
          <p>
            The application processes Google account information needed for
            sign-in, authentication credentials, domain names, verification
            records, and responses from the Google Postmaster Tools API.
          </p>
          <p>
            Authentication information is maintained using protected session
            mechanisms. Application hosting providers may process technical
            request and diagnostic information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Use of Information</h2>
          <p>
            Information is used to authenticate users, perform requested
            domain operations, show results, and support application
            functionality and security.
          </p>
          <p>
            Google user data is not sold or used for advertising.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Data Sharing</h2>
          <p>
            The application communicates with Google APIs and uses hosting
            infrastructure to operate the service. Information may be
            processed by these service providers as necessary to deliver
            the application.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Security and Retention</h2>
          <p>
            The application uses OAuth authentication and server-side
            API requests to protect Google credentials. Authentication
            sessions are retained according to the configured session
            lifetime. Technical logs may be retained by the hosting
            provider according to its settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Your Choices</h2>
          <p>
            Users may sign out of the application and revoke its Google
            Account permissions at any time through Google Account settings.
            Revoking access prevents future authorized API operations.
          </p>
          <a
            href="https://myaccount.google.com/connections"
            className="text-indigo-400 hover:underline"
          >
            Manage Google Account connections
          </a>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Contact</h2>
          <p>
            For privacy questions or requests, contact the application
            developer using the support email provided on the
            Postmaster Manager Google OAuth consent screen.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6 text-center text-sm text-slate-500">
          Postmaster Manager · Created by Ilyas Houari
        </footer>
      </article>
    </main>
  );
}
