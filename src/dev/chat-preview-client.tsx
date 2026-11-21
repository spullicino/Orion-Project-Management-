"use client";

// Development-only: chat screens with sample data.
import { ChannelList } from "@/components/chat/channel-list";
import { ChatNotifyBanner } from "@/components/chat/chat-notify-banner";
import { Conversation } from "@/components/chat/conversation";
import { UnreadProvider } from "@/components/chat/unread-provider";
import { previewChannel, previewChannels, previewMessages, previewPeople } from "./chat-fixtures";

export function ChatPreviewClient({ view }: { view?: string }) {
  return (
    <UnreadProvider initial={3}>
      {view === "list" ? (
        <>
          <ChatNotifyBanner />
          <ChannelList channels={previewChannels} activeId="c1" canCreate />
        </>
      ) : (
        <div className="md:h-[calc(100dvh-3rem)] md:rounded-xl md:border md:bg-card md:flex md:flex-col">
          <Conversation
            channel={previewChannel}
            initial={previewMessages}
            people={previewPeople}
            me={{ id: "u3", first_name: "Tina", last_name: "Camilleri", email: "tech1@orion.test", avatar_src: null, isAdmin: false, isManager: false }}
          />
        </div>
      )}
    </UnreadProvider>
  );
}
