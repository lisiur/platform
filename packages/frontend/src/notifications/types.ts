export interface UserNotification {
  id: string;
  renderedTitle: string | null;
  renderedBody: string;
  readAt: string | null;
  createdAt: string;
}
