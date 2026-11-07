# Gerçek zamanlı olaylar (WebSocket `/ws`)

> Otomatik üretildi: `node backend/scripts/gen_docs.mjs`. Elle düzenlemeyin.

Bağlantı: `wss://SUNUCU/ws?token=JWT`. Mesajlar JSON, her mesajda `type` alanı var.

## İstemciden sunucuya

- `ping`
- `room_unsubscribe`
- `presence_watch`
- `typing`
- `room_subscribe`

## Sunucudan istemciye (55 tür)

| Tür | Kime | Gönderen dosya |
|---|---|---|
| `agency_assistant_invite` | kişiye | routes/agency_center.js |
| `agency_created` | kişiye | routes/admin.js |
| `agency_invite` | kişiye | routes/agencies.js |
| `agency_update` | kişiye | routes/agencies.js, routes/agency_center.js, services/agency_ops.js |
| `chat_restricted` | kişiye | routes/admin.js, services/moderation.js |
| `connected` | bağlantıya | realtime.js |
| `cp_request` | kişiye | routes/cp.js |
| `cp_update` | kişiye | routes/cp.js |
| `dm` | kişiye | routes/messages.js |
| `dm_read` | kişiye | routes/messages.js |
| `error` | bağlantıya | realtime.js |
| `event_reward` | kişiye | services/weekly_events.js |
| `family_chat` | kişiye | routes/families.js |
| `family_request` | kişiye | routes/families.js |
| `friend_update` | kişiye | routes/friends.js, routes/store.js |
| `inbox_update` | herkese | routes/admin.js |
| `lucky_bag_claimed` | odaya | routes/luckybag.js |
| `lucky_bag_ended` | odaya | routes/luckybag.js |
| `lucky_bag_global` | herkese | routes/luckybag.js |
| `lucky_bag_new` | odaya | routes/luckybag.js |
| `lucky_gift_win` | herkese | routes/gifts.js |
| `mic_invite` | kişiye | routes/rooms.js, services/micqueue.js |
| `mic_request_declined` | kişiye | routes/rooms.js |
| `notify` | kişiye | services/notify.js |
| `pk_invite` | kişiye | routes/pk.js |
| `pk_state` | odaya | routes/gifts.js |
| `pong` | bağlantıya | realtime.js |
| `presence` | izleyenlere | realtime.js |
| `presence_state` | bağlantıya | realtime.js |
| `push` | herkese | routes/admin.js |
| `room_chat_cleared` | odaya | routes/chat.js |
| `room_chat_muted` | kişiye | routes/chat.js |
| `room_closed` | odaya | services/rooms.js |
| `room_game_state` | odaya | services/games.js |
| `room_gift` | odaya | routes/gifts.js |
| `room_kicked` | kişiye | routes/admin_panel.js |
| `room_member_joined` | odaya | routes/rooms.js, services/ghost.js |
| `room_member_left` | odaya | routes/rooms.js, services/ghost.js, services/rooms.js |
| `room_member_updated` | odaya | services/users.js |
| `room_message` | odaya | routes/chat.js |
| `room_message_deleted` | odaya | routes/admin_panel.js, routes/chat.js |
| `room_mic_emoji` | odaya | routes/rooms.js |
| `room_mic_queue` | odaya | services/micqueue.js |
| `room_music_state` | odaya | services/music.js |
| `room_pk_state` | odaya | services/room_pk.js |
| `room_pk_tick` | odaya | services/room_pk.js |
| `room_role_changed` | odaya | routes/rooms.js |
| `room_scoreboard` | odaya | routes/gifts.js, routes/rooms.js |
| `room_seat_changed` | odaya | routes/rooms.js |
| `room_seats_locked` | odaya | routes/rooms.js |
| `room_seats_muted` | odaya | routes/rooms.js |
| `room_settings` | odaya | routes/rooms.js |
| `room_subscribed` | bağlantıya | realtime.js |
| `support_message` | kişiye | routes/admin.js |
| `typing` | kişiye | realtime.js |
