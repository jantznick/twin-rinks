export default function TelegramInstructionsModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-900">Telegram Installation Instructions</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6 text-sm text-slate-700">
          <ol className="list-decimal space-y-3 pl-5 marker:font-medium marker:text-slate-500">
            <li>
              Download <strong>Telegram Messenger</strong> on your phone:
              <div className="mt-2 flex gap-3">
                <a 
                  href="https://apps.apple.com/us/app/telegram-messenger/id686449807" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.74.89-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.95 1.34-1.94 2.67-3.456 2.71-1.514.03-2.01-.89-3.74-.89-1.74 0-2.31.86-3.71.92-1.46.05-2.62-1.46-3.58-2.8-1.96-2.81-3.47-7.95-1.46-11.45 1-1.74 2.75-2.84 4.65-2.88 1.44-.04 2.76.96 3.65.96.9 0 2.52-1.23 4.28-1.05.73.04 2.78.3 4.04 2.15-3.41 2.05-2.84 6.28.6 7.64-.17.52-.45 1.11-.76 1.57z" />
                  </svg>
                  App Store
                </a>
                <a 
                  href="https://play.google.com/store/apps/details?id=org.telegram.messenger&hl=en_US" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 20.5v-17c0-.5.4-.8.8-.6l16 8c.4.2.4.8 0 1l-16 8c-.4.2-.8-.1-.8-.6zm2-15v13l11-6.5-11-6.5z" />
                  </svg>
                  Google Play
                </a>
              </div>
            </li>
            <li>Launch Telegram</li>
            <li>Click <strong>Start Messaging</strong></li>
            <li>Enter your phone number, click continue</li>
            <li>Enter the authentication code</li>
            <li>Enter your name and click continue</li>
            <li>Access contacts? (You can choose "Don't Allow")</li>
            <li>Send Notifications? Click <strong>Allow</strong></li>
            <li>Use Siri? (You can choose "Don't Allow" or skip for Android)</li>
            <li>In the search bar at the top enter: <code>@raw_data_bot</code></li>
            <li>Click on the top result (blue envelope inside a circle)</li>
            <li>Click <strong>Start</strong> (write down the ID number, this is your <strong>Chat ID</strong>, you will need it later)</li>
            <li>Click Back</li>
            <li><a href="https://t.me/TwinRinksBot" target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">On your phone click here to get TwinRinks-texting</a></li>
            <li>Click <strong>Start</strong></li>
            <li>Go to the Twin Rinks website and enter in your username and password</li>
            <li>Go to your Profile page</li>
            <li>Make sure your cell phone number is correct</li>
            <li>Select <strong>Telegram Messenger</strong> as your carrier</li>
            <li>Enter your <strong>Chat ID</strong></li>
            <li>Check "Send a test Telegram notification" and save</li>
          </ol>

          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <h3 className="font-semibold mb-2">Troubleshooting Notifications</h3>
            <p className="mb-2">You should get the Telegram message within 5 minutes. If you click on the button at the bottom of each message it takes you to the login screen.</p>
            <p className="mb-2">There are 3 places to set notifications:</p>
            <ul className="list-disc space-y-1 pl-5 text-amber-800">
              <li>In Telegram: Settings &gt; Notifications (make sure the slides are on the right and green)</li>
              <li>In Phone Settings: Notifications &gt; Telegram (make sure all the slides are on the right and green)</li>
              <li>In Phone Settings: Notifications (on the top "Stack" should be selected)</li>
            </ul>
            <p className="mt-3 text-xs italic text-amber-700">
              Need help? Email <a href="mailto:subs@twinrinks.com" className="underline hover:text-amber-900">subs@twinrinks.com</a> for an appointment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
