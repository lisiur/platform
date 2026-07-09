import { Inbox, Mail, MessageCircle } from "lucide-react";

export function getChannelIcon(providerKey?: string) {
  if (providerKey === "in-app")
    return <Inbox className="h-4 w-4 text-muted-foreground" />;
  if (providerKey === "smtp-email")
    return <Mail className="h-4 w-4 text-muted-foreground" />;
  if (providerKey === "sms")
    return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
  return null;
}
