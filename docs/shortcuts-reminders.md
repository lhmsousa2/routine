# Reminders with iPhone Shortcuts

Web apps on iPhone can't schedule their own notifications, so we use the built-in **Shortcuts** app. It takes about 5 minutes and needs no server.

## One reminder (repeat for each time)

1. Open **Shortcuts** → **Automation** tab (bottom) → **+** (top right).
2. Choose **Time of Day**.
3. Set the time (e.g. **09:30**), **Repeat: Daily**.
4. Choose **Run Immediately** (not "Run After Confirmation"). Turn **off** "Notify When Run".
5. Tap **Next** → **New Blank Automation** → **Add Action**.
6. Search for **Show Notification**, add it, and type the message.
7. *(Optional)* Add a second action: **Open App**… won't work for web apps, so instead add **Open URLs** with your app's address. Tapping the notification then opens the app.
8. Tap **Done**.

## Suggested schedule

| Time  | Message |
|-------|---------|
| 09:15 | ⏰ Wake-up check-in closes at 09:30 |
| 13:30 | Midday check: anything quick you can tick off? |
| 18:00 | Evening push: walk/run and push-ups before dinner? |
| 22:00 | ⚠️ 2 hours left. Unfinished goals cost 15 coins each |

Change the times/messages any time in the Automation tab.
