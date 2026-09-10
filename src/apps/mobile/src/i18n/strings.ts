/**
 * Strings for the three-role auth screens.
 */
export const strings = {
  appName: 'KalaSetu',
  roleSelect: {
    title: 'Who is signing in?',
    subtitle: 'Choose how you use KalaSetu',
    artisan: 'Artisan',
    artisanHint: 'List and sell your products',
    coordinator: 'Coordinator',
    coordinatorHint: 'Sakhi — manage artisans you support',
    admin: 'Administrator',
    adminHint: 'Manage coordinators',
  },
  login: {
    enterPhone: 'Your mobile number',
    sendOtp: 'Send code',
    enterOtp: 'Enter the code',
    otpSentTo: 'Code sent to',
    verify: 'Check code',
    resend: 'Resend code',
    changeNumber: 'Use a different number',
    devOtpNotice: 'Dev mode — your code is',
    createPin: 'Choose a 4-digit PIN',
    createPinHelp: 'You will use this to open the app next time.',
    confirmPin: 'Enter your PIN again',
    pinMismatch: 'The two PINs are different. Try again.',
    enterPin: 'Enter your PIN',
    useOtpInstead: 'Use a code instead',
  },
  admin: {
    title: 'Coordinators',
    empty: 'No coordinators yet',
    emptyHint: 'Add the first one below',
    add: 'Add coordinator',
    name: 'Name',
    phone: 'Mobile number',
    artisanCount: (n: number) => `${n} artisan${n === 1 ? '' : 's'}`,
    remove: 'Remove',
    removeConfirmTitle: 'Remove this coordinator?',
    removeConfirmBody: 'Her artisans keep their catalogues and become self-managed.',
  },
  sakhi: {
    empty: 'No artisans yet',
    emptyHint: 'Load a few to see how this looks',
    loadDemo: 'Load demo artisans',
    noPhone: 'No phone yet',

    profilesTitle: 'My Artisans',
    mapTitle: 'Where They Are',
    mapEmpty: 'No artisans to show on the map yet.',
    mapCount: (n: number) => `${n} artisan${n === 1 ? '' : 's'} on the map`,
    directoryTitle: 'Directory',

    chat: 'Chat',
    call: 'Call',
    typeMessage: 'Type a message in English…',
    voiceMessage: 'Voice message',
    playVoice: 'Play voice message',
  },
  home: {
    signedInAs: 'Signed in as',
    role: 'Role',
    signOut: 'Sign out',
    placeholder: 'The artisan app lives in apps/mobile. This screen only confirms the session.',
  },
  common: {
    retry: 'Try again',
    loading: 'Loading…',
    error: 'Something went wrong',
    save: 'Save',
    cancel: 'Cancel',
    back: 'Back',
    done: 'Done',
    send: 'Send',
  },
  errors: {
    invalidPhone: 'Enter a 10-digit mobile number.',
    invalidInput: 'Something you entered is not right. Please check it.',
  },
} as const;

export function t() {
  return strings;
}
