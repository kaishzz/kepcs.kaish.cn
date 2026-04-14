import type {
  DialogApiInjection,
  LoadingBarApiInjection,
  MessageApiInjection,
  ModalApiInjection,
  NotificationApiInjection,
} from 'naive-ui'

declare global {
  interface Window {
    $message?: MessageApiInjection
    $dialog?: DialogApiInjection
    $notification?: NotificationApiInjection
    $loadingBar?: LoadingBarApiInjection
    $modal?: ModalApiInjection
  }
}

export {}
