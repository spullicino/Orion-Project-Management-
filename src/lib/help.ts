import type { AppRole } from "@/types/database";

/**
 * In-app help: step-by-step guides for every part of the app.
 * Text in **double stars** is shown in bold (button and menu names).
 * `minRole` hides a guide from people who can't use that feature.
 */
export type HelpGuide = { title: string; steps: string[]; tip?: string; minRole?: AppRole };
export type HelpTopic = {
  id: string;
  title: string;
  icon: string; // lucide icon name, see help-view.tsx
  summary: string;
  where?: string; // where to find it
  minRole?: AppRole;
  guides: HelpGuide[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: "Rocket",
    summary: "Signing in, installing the app on your phone and finding your way around.",
    guides: [
      {
        title: "Sign in",
        steps: [
          "Open the app address in your browser.",
          "Type your email and password and tap **Sign in** — or tap **Continue with Google**.",
          "Leave **Keep me signed in on this device** ticked on your own phone. Untick it on a shared computer.",
        ],
        tip: "Forgot your password? Tap **Forgot password?** on the sign-in page and we'll email you a link.",
      },
      {
        title: "Create an account",
        steps: [
          "On the sign-in page tap **Create an account**.",
          "Fill in your name, email and a password, then tap **Create account**.",
          "Open the email we send you and tap the confirmation link.",
          "Wait for an administrator to approve you — you'll see an “Almost there!” page until then.",
        ],
      },
      {
        title: "Install the app on your phone",
        steps: [
          "**iPhone:** open the app in Safari → tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.",
          "**Android:** open the app in Chrome → tap **Install** when asked, or **⋮ → Install app**.",
          "From now on, open Orion Projects from the new icon on your home screen.",
        ],
        tip: "You can always find these steps again in **Profile → Install the app**.",
      },
      {
        title: "Find your way around",
        steps: [
          "**On a phone:** use the bar at the bottom — Home, Projects, Daily Update, Chats and Profile. Managers and admins have **Overview** in place of Daily Update.",
          "**On a computer:** use the menu on the left.",
          "My Tasks, Personal and Help are in the left menu on a computer, or under **Profile** on a phone.",
          "The 🔔 bell at the top shows your notifications.",
        ],
      },
    ],
  },
  {
    id: "home",
    title: "Home",
    icon: "House",
    summary: "Your starting page: what needs your attention today.",
    where: "Home",
    guides: [
      {
        title: "Use the Home page",
        steps: [
          "Open **Home**.",
          "The **My Tasks** card shows how many of your tasks are overdue, due today and still open. Tap it to see them.",
          "Scroll down for shortcuts to your projects, Daily Update, Chats and Personal.",
          "Managers also see **Projects that need attention**.",
          "Tap **What's new** (next to the greeting) to see recent improvements. A red dot means there's something you haven't seen yet.",
        ],
        tip: "If you see “Add your name”, tap it so colleagues know who you are.",
      },
      {
        title: "See today's updates and material requests at a glance",
        minRole: "manager",
        steps: [
          "Open **Home** — the two cards at the top show **Daily updates today** and **Material requests** for your projects. On a phone you can also tap **Overview** in the bottom bar.",
          "**Daily updates today** shows how many people have posted, who hasn't yet, and the latest updates. Tap an update to read it in full, or **See all daily updates** for photos, other days and PDF reports.",
          "**Material requests** shows new (not yet ordered), open and late requests, most urgent first. Tap one to open it and mark it ordered or delivered.",
          "A red number on **Overview** means there are new material requests waiting.",
          "To post your own update or request materials, use the buttons at the top of **Overview** (or the shortcuts on Home).",
        ],
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    icon: "FolderKanban",
    summary: "Finding, creating and organising projects.",
    where: "Projects",
    guides: [
      {
        title: "Open a project",
        steps: [
          "Tap **Projects**.",
          "Use the search box or the **Active / All incl. archived** filters to find it.",
          "Tap the project. The tabs along the top (Dashboard, Board, Kanban, Gantt, Calendar, Diary, Photos, Chat) show different views of the same project.",
        ],
        tip: "You only see projects you've been added to (and ones you created). Administrators see every project. Can't find one? Ask a manager or administrator to add you.",
      },
      {
        title: "Create a new project",
        minRole: "manager",
        steps: [
          "Tap **Projects → New project**.",
          "Under **Start from**, choose **A blank project**, a template, or **Copy an existing project**.",
          "Enter the **Project name** (e.g. Sliema Apartment Refurbishment), and optionally a project code, client, start and end dates and a colour.",
          "Tap **Create**.",
          "Open **Settings → People on this project** to add the team.",
        ],
      },
      {
        title: "Add or remove people on a project",
        minRole: "manager",
        steps: [
          "Open the project and tap the **Settings** tab.",
          "Under **People on this project**, choose someone in **Choose a person to add…** and tap **Add**.",
          "To remove someone, tap **Remove** next to their name.",
        ],
      },
      {
        title: "Change statuses, columns or save as a template",
        minRole: "manager",
        steps: [
          "Open the project's **Settings** tab.",
          "**Statuses:** rename them, change their colour or add new ones.",
          "**Extra columns:** add your own column (text, number, date…), e.g. Room, Qty or PO number.",
          "**Save as template:** reuse this project's groups, tasks and columns for future projects.",
          "Change **Project status** to On hold, Completed or Archived when the job is finished.",
        ],
      },
    ],
  },
  {
    id: "tasks",
    title: "Tasks & the Board",
    icon: "Table2",
    summary: "Adding tasks, updating their status and working with the task details.",
    where: "Projects → a project → Board",
    guides: [
      {
        title: "Add a task",
        minRole: "technician",
        steps: [
          "Open the project's **Board** tab.",
          "Under the right group, tap **Add a task**, type the name and press Enter.",
          "Tap the new task to fill in the details.",
        ],
      },
      {
        title: "Update a task",
        minRole: "technician",
        steps: [
          "Tap the task to open its details.",
          "Change the **Status** (e.g. Working on it, Stuck, Done), **Owners**, **Priority**, **Start** and **Due** dates, or **Progress** (in steps of 5%).",
          "Changes save straight away — there's no save button.",
        ],
        tip: "Marking a task **Done** sets it to 100% and removes it from everyone's “due” lists.",
      },
      {
        title: "Add a description, checklist, files or comments",
        steps: [
          "Open the task.",
          "**Description:** measurements, instructions, anything useful.",
          "**Checklist:** tap **Add item** for each small step and tick them off as you go.",
          "**Files:** tap **Choose files to attach** to add photos, drawings or PDFs.",
          "**Comments:** write in **Write a comment** and send. Type @ and a name to notify someone.",
          "**Activity** shows the full history of who changed what.",
        ],
      },
      {
        title: "Make a task repeat",
        minRole: "technician",
        steps: [
          "Open the task and give it a **Due** date.",
          "Under **Repeat**, choose how often: every day, every weekday, every week, every 2 weeks, every month, every 3 months or every year.",
          "Optionally tap **No end date** to choose when the repeats should stop.",
          "When the task is marked **Done**, the next one appears automatically with the next date, the same owners and an unticked checklist. Owners get a notification.",
        ],
        tip: "Repeating tasks show a 🔁 symbol on the board. Finished late? The next one is still set in the future, not already overdue.",
      },
      {
        title: "Add a task in between others, or change the order",
        minRole: "technician",
        steps: [
          "Open the task next to where the new one should go (tap it on the Board or the Gantt).",
          "At the bottom, tap **Insert task above** or **Insert task below**. Dates are suggested (just before or after it) — change them if needed.",
          "If the tasks are linked, keep **Keep the chain in order** ticked: the links become A → new → B. Later dates aren't moved.",
          "To change the order, drag a task by its handle (⋮⋮) on the Board — on phones, press and hold the handle. Or open the task and tap **Move up** / **Move down**. The Gantt follows the same order.",
        ],
      },
      {
        title: "Copy a task to other projects",
        minRole: "technician",
        steps: [
          "Open the task, e.g. an internal “Monthly bill”.",
          "At the bottom of the task, tap **Copy to other projects**.",
          "Tick the projects to copy it to. For each one, choose the **Group** and the **Due date**.",
          "Tap **Copy**. Each copy starts as Not started, with the same details, checklist (unticked), Internal and Repeat settings.",
        ],
        tip: "Owners are kept only if they're on that project. Comments, files and history stay with the original.",
      },
      {
        title: "Keep a task internal (team only)",
        minRole: "technician",
        steps: [
          "Open the task, e.g. “Issue monthly invoice to client”.",
          "Switch on **Internal**. The task gets a 🔒 on the board.",
          "Internal tasks never appear on client links or Gantt exports, and don't count towards % complete or the project's health.",
          "The team still sees them on the Board, My Tasks and the Calendar, and gets the usual reminders.",
          "On the **Gantt** and **Kanban** they're hidden; switch on **Show internal tasks** to see them there.",
        ],
      },
      {
        title: "Make a task wait for another",
        minRole: "technician",
        steps: [
          "Open the task.",
          "Under **Waiting for**, tap **Add a task this one waits for** and pick the task that has to finish first.",
          "If that task runs late, this one gets a warning automatically.",
        ],
      },
      {
        title: "Find and filter tasks",
        steps: [
          "On the Board tap **Filters** (on a phone) or use the filter bar.",
          "Filter by person, status or due date, or type in **Search tasks**.",
          "Tap **Clear filters** to see everything again.",
        ],
      },
      {
        title: "Organise groups",
        minRole: "manager",
        steps: [
          "Tap **Add group** at the bottom of the Board to add a phase (e.g. Phase 2).",
          "Use the group's **⋯** menu to **Rename**, **Move up / down / to top / to bottom**, or **Delete group**.",
          "Or drag a group by the handle (⋮⋮) next to its name and drop it on another group (on phones, press and hold the handle). The Gantt follows the same order.",
        ],
      },
      {
        title: "Use the Kanban view",
        minRole: "technician",
        steps: [
          "Open the project's **Kanban** tab — one column per status.",
          "Drag a card to another column to change its status. On a phone, press and hold the card first.",
        ],
      },
    ],
  },
  {
    id: "my-tasks",
    title: "My Tasks",
    icon: "ListChecks",
    summary: "Everything assigned to you across all projects, in one list.",
    where: "My Tasks (left menu, or Profile on a phone)",
    guides: [
      {
        title: "Work through your tasks",
        steps: [
          "Open **My Tasks**.",
          "Tasks are grouped: Overdue, Due today, Next 7 days, Later, No due date and Done recently.",
          "Tick the circle to mark a task done, or tap the task to open it.",
          "Tap a project name to open that project.",
        ],
      },
    ],
  },
  {
    id: "gantt",
    title: "Gantt, calendar & milestones",
    icon: "GanttChartSquare",
    summary: "The project timeline, key dates and exporting it for clients.",
    where: "Projects → a project → Gantt / Calendar",
    guides: [
      {
        title: "Read the Gantt chart",
        steps: [
          "Open the project's **Gantt** tab.",
          "Each bar is a task from its start to its due date. Diamonds are milestones. Arrows show which task waits for which.",
          "Use **Zoom** (Days, Weeks, Months) and **Today** to move around.",
          "Red bars are overdue or blocked; amber ones are at risk.",
        ],
      },
      {
        title: "Change dates on the Gantt",
        minRole: "manager",
        steps: [
          "**Computer:** drag a bar to move it, or drag either end to change the start or due date.",
          "**Phone:** tap a bar and pick the new dates.",
        ],
      },
      {
        title: "Add a milestone",
        minRole: "manager",
        steps: [
          "On the Gantt tap **Milestone**.",
          "Give it a **Name** (e.g. Client walkthrough) and a **Date**, then save.",
          "It appears as a diamond on the Gantt and on the Calendar.",
        ],
      },
      {
        title: "Export the Gantt as PDF or picture",
        minRole: "manager",
        steps: [
          "On the Gantt tap **Export**.",
          "Choose PDF or PNG, the paper size, scale and how to colour the bars.",
          "Tap the export button — the file downloads to your device, ready to email.",
        ],
      },
      {
        title: "Use the Calendar",
        steps: [
          "Open the project's **Calendar** tab.",
          "Due dates and milestones are shown by month. Use the arrows or **This month** to move around.",
          "Tap a task to open it.",
        ],
      },
    ],
  },
  {
    id: "client-links",
    title: "Sharing with clients",
    icon: "Share2",
    summary: "A read-only link so a client can see progress without an account.",
    minRole: "manager",
    where: "Projects → a project → Gantt → Share with client",
    guides: [
      {
        title: "Create a client link",
        steps: [
          "On the project's Gantt tap **Share with client**.",
          "Optionally write **Who is it for?** (e.g. Claire at Harbour Holdings) and choose **Link works for**.",
          "Tap **Create**, then copy the link and send it to the client.",
          "The client sees the timeline and progress only — no internal notes, chats or costs.",
        ],
      },
      {
        title: "Stop a link working",
        steps: [
          "Open **Share with client** again.",
          "Under **Links for this project**, tap **Turn off** next to the link.",
        ],
      },
      {
        title: "Manage clients",
        steps: [
          "Open **Clients** (left menu, or Profile on a phone).",
          "Tap **Add** to create a client with contact details and a logo — the logo appears on exports.",
        ],
      },
    ],
  },
  {
    id: "daily-update",
    title: "Daily Update",
    icon: "ClipboardPenLine",
    summary: "Recording what you did each day, with hours and site photos.",
    where: "Daily Update",
    guides: [
      {
        title: "Post your daily update",
        minRole: "technician",
        steps: [
          "Tap **Daily Update** (managers: **Overview → Post an update**).",
          "Choose the **Project**.",
          "Write **What did you do today?**",
          "Pick the hours you worked (optional).",
          "Tap **Add issues or delays** if something held you up.",
          "Tap **Take photo** or **From gallery** to add pictures.",
          "Tap **Post update**.",
        ],
        tip: "No signal on site? Post anyway. The update is saved on your phone and sends by itself when you're back online — a yellow bar shows what's waiting.",
      },
      {
        title: "Daily reminder to post",
        minRole: "technician",
        steps: [
          "On working days, if you haven't posted your daily update yet, your phone gets a reminder in the afternoon (4:30pm unless your administrator changed it).",
          "Tap the reminder to go straight to **Daily Update** and post.",
          "Already posted that day? You won't get it.",
          "To stop these reminders, open **🔔 → Settings** and switch off **Reminder to post my daily update**.",
        ],
        tip: "Phone notifications must be turned on first: **🔔 → Settings → Turn on phone notifications**.",
      },
      {
        title: "Edit or delete an update",
        minRole: "technician",
        steps: [
          "Find it under **Your recent updates**.",
          "Tap **⋯ → Edit** or **Delete**. You can change your own updates for 24 hours.",
        ],
      },
      {
        title: "See the project diary and photos",
        steps: [
          "Open a project and tap **Diary** to read every update day by day.",
          "Tap **Photos** to see every site photo. Tap one to see it full size.",
        ],
      },
      {
        title: "Check who has posted today",
        minRole: "manager",
        steps: [
          "Open **Daily Update → Team overview & reports**.",
          "Use **Previous day / Next day** to check any date.",
          "You can see who has posted and who hasn't yet.",
        ],
      },
      {
        title: "Make a PDF report for a client",
        minRole: "manager",
        steps: [
          "In **Team overview & reports** tap **PDF report**.",
          "Choose the project and dates (e.g. **Last 7 days**), and the photo quality.",
          "Tap the export button. Internal notes are never included.",
        ],
      },
    ],
  },
  {
    id: "materials",
    title: "Material requests",
    icon: "Package",
    summary: "Asking for materials to be delivered to site, and tracking them until they arrive.",
    where: "Projects → a project → Materials, or Materials in the menu",
    guides: [
      {
        title: "Request materials",
        minRole: "technician",
        steps: [
          "Tap **Request materials** on Home (or open the project and tap the **Materials** tab).",
          "Tap **New request**.",
          "For each item, start typing and pick the product from the list — its unit is filled in. Not in the list? Just type it. Then enter the quantity. Tap **Add another item** for more.",
          "Set **Needed by**, switch on **Urgent** if it is, and add **Delivery notes** (e.g. which gate to use).",
          "Add photos if they help (e.g. the label of what's needed), then tap **Send request**.",
        ],
        tip: "No signal? Send it anyway — it's saved on your phone and sent automatically when you're back online. You'll be notified when it's ordered and delivered.",
      },
      {
        title: "Change or cancel your request",
        minRole: "technician",
        steps: [
          "Open the request. While it still says **Requested**, tap **Edit** to change it, or **Cancel request**.",
          "Once a manager has ordered it, ask questions in **Comments** instead.",
        ],
      },
      {
        title: "Order and receive materials",
        minRole: "manager",
        steps: [
          "You're notified of every new request on your projects. Open it from the bell or from **Materials**.",
          "Tap **Mark ordered** and add the supplier, PO number and expected delivery date. The worker is told it's on its way.",
          "Tap **PDF for supplier** for a clean list to email to the supplier.",
          "When it arrives, tap **Record delivery**. Change any quantity that came short — it's then marked **Partly delivered** until the rest arrives.",
          "If it isn't needed, tap **Reject** and say why.",
        ],
        tip: "Requests whose needed-by date has passed are marked **Late**. You also get a morning reminder for materials needed today or tomorrow that haven't been ordered.",
      },
      {
        title: "Order the same again",
        steps: ["Open an earlier request and tap **Reorder** to start a new one with the same items."],
      },
      {
        title: "Materials report for a project",
        steps: [
          "Open the project, tap **Materials**, then **Materials report**.",
          "Choose the dates (**From** / **To**) and, if you like, a category.",
          "You'll see how much of each product was delivered (and how much was requested).",
          "Tap **PDF** or **Excel (CSV)** to download it.",
        ],
      },
      {
        title: "Keep the product list",
        minRole: "manager",
        steps: [
          "Open **Products** in the menu (on phones: **Profile → Products**).",
          "Tap **Add product**: name, unit, and optionally a category (e.g. Electrical) and product code.",
          "Tap **Export to Excel** to download the whole list as a spreadsheet (columns Name, Unit, Category, Code).",
          "To add many products at once, add new rows at the bottom of that spreadsheet, save it, then tap **Import from Excel → Choose Excel or CSV file** and pick it. You can also copy the cells in Excel and paste them in.",
          "Check the preview and tap **Import**. Only new products are added — ones already in the list (same name and unit) are skipped and left as they are.",
          "Products you no longer use can be **retired** — they disappear from new requests but stay in old ones and in reports.",
          "If a worker types something that isn't in the list, open the request and tap **Add to products** next to it.",
        ],
      },
    ],
  },
  {
    id: "chats",
    title: "Chats",
    icon: "MessagesSquare",
    summary: "Company, management and project conversations.",
    where: "Chats",
    guides: [
      {
        title: "Send a message",
        steps: [
          "Tap **Chats** and choose a conversation: Company, Management (managers only) or a project.",
          "Type at the bottom and tap **Send**.",
          "Type @ followed by a name to mention someone — they get notified.",
          "Tap the paperclip to attach photos or files, or the link button to attach a task.",
        ],
      },
      {
        title: "Reply, react, edit or delete",
        steps: [
          "Press and hold a message (or hover on a computer).",
          "Choose a reaction, reply in a thread, **Copy text**, or **Edit** / **Delete** your own messages.",
        ],
      },
      {
        title: "Get a notification for every message (like WhatsApp)",
        steps: [
          "Open **Chats** and tap **Turn on notifications** at the top (or **Profile → Notifications → Turn on notifications**). Allow notifications when your phone asks.",
          "**iPhone:** this only works in the installed app — add it to your Home Screen first (Share → Add to Home Screen) and open it from the icon.",
          "Every new message now shows on your phone, grouped per chat. The app icon shows how many are unread.",
          "Opening a chat clears its notifications.",
        ],
        tip: "Too many? **Mute** a busy chat, or switch off **New chat messages** in Profile → Notifications. Quiet hours keep your phone silent at night.",
      },
      {
        title: "See all photos and files in a chat",
        steps: [
          "Open the chat and tap **Chat options** (⋯) at the top.",
          "Tap **Photos & files**. Switch between **Photos** and **Files**; newest are first, grouped by month.",
          "Tap a photo to see it full screen, or a file to open or download it.",
          "Tap **Go to message** (or the speech-bubble next to a file) to jump to where it was posted.",
        ],
      },
      {
        title: "Mute a chat",
        steps: [
          "Open the chat and tap **Chat options** (⋯) at the top.",
          "Choose **Mute** — you'll still see unread counts but won't get phone notifications. **Unmute** turns them back on.",
        ],
      },
      {
        title: "Start a new chat",
        minRole: "manager",
        steps: [
          "In Chats tap **+ New**.",
          "Give it a **Name** (e.g. Tenders, Health & Safety) and choose **Who can see it**: managers only, or everyone (announcements).",
          "Tap **Create**.",
        ],
      },
    ],
  },
  {
    id: "personal",
    title: "Personal notes & to-dos",
    icon: "NotebookTabs",
    summary: "Your own private list and notes. Nobody else can see them — not even administrators.",
    where: "Personal (left menu, Home, or Profile on a phone)",
    guides: [
      {
        title: "Add a personal to-do",
        steps: [
          "Open **Personal** → **To-do**.",
          "Type the to-do, choose a due date if you like, and tap **Add**.",
          "Tap the circle to tick it off. Tap the text to change it.",
          "Done items move to **Done** — tap **Clear done** to tidy up.",
        ],
        tip: "If you set a due date you'll get a reminder the day before and on the day.",
      },
      {
        title: "Write a note",
        steps: [
          "Open **Personal** → **Notes** → **New note**.",
          "Type a title and your note — it saves by itself as you type.",
          "For a list, tap **Bullet list** (or start a line with - and a space). Press Enter for the next bullet, and Enter twice to end the list.",
          "Pick a colour or tap **Pin to top** to keep it first.",
          "Tap **Done** to close it. Use **Search notes** to find it later.",
        ],
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "Bell",
    summary: "The bell, phone notifications and the daily email summary.",
    where: "🔔 bell, and Profile → Notifications",
    guides: [
      {
        title: "Turn on phone notifications",
        steps: [
          "Open **Profile**.",
          "Under **Notifications** tap **Turn on notifications** and allow them when your phone asks.",
          "Tap **Send a test** to check it works.",
        ],
        tip: "On iPhone this only works when the app is installed on your Home Screen (iOS 16.4 or newer).",
      },
      {
        title: "Choose what you're told about",
        steps: [
          "In **Profile → Notifications**, under **Tell me when…**, switch each type on or off.",
          "Set **Quiet hours** so your phone stays silent at night.",
          "Switch on **Daily email summary** if you'd like one email each morning.",
        ],
      },
      {
        title: "Read your notifications",
        steps: [
          "Tap the 🔔 bell at the top. A number shows how many are unread.",
          "Tap a notification to go straight to the task, message or update.",
        ],
      },
    ],
  },
  {
    id: "dashboards",
    title: "Dashboards & delay warnings",
    icon: "LayoutDashboard",
    summary: "Progress at a glance, and what the red and amber warnings mean.",
    where: "Projects → a project → Dashboard",
    guides: [
      {
        title: "Read a project dashboard",
        steps: [
          "Open a project — the **Dashboard** tab opens first.",
          "See % complete, overdue and due-soon tasks, **Tasks by status**, **Open tasks per person** and **Upcoming milestones**.",
          "The badge at the top says **On track**, **Needs attention** or **At risk**.",
        ],
      },
      {
        title: "What the warnings mean",
        steps: [
          "⛔ **Red:** the task is overdue, or it's waiting for a task that is late.",
          "⚠ **Amber:** due within 2 days and less than half done, behind schedule, or waiting for a task that isn't finished yet.",
          "Fix it by updating the progress or dates, or by talking to the owner.",
        ],
      },
    ],
  },
  {
    id: "profile",
    title: "Your profile",
    icon: "UserRound",
    summary: "Your name, photo, password, dark mode and signing out.",
    where: "Profile",
    guides: [
      {
        title: "Update your details",
        steps: [
          "Open **Profile**.",
          "Change your name or phone number and tap **Save changes**.",
          "Tap your picture to upload a new photo.",
        ],
      },
      {
        title: "Dark mode",
        steps: ["In **Profile → Appearance**, choose Light, Dark or System."],
      },
      {
        title: "Sign out",
        steps: [
          "Open **Profile** and tap **Sign out** at the bottom.",
          "Saved pages are wiped from the device, so a shared phone stays private.",
        ],
      },
    ],
  },
  {
    id: "offline",
    title: "Working without signal",
    icon: "WifiOff",
    summary: "What works on site when there's no connection.",
    guides: [
      {
        title: "What works offline",
        steps: [
          "Pages you've opened before still open, showing what they had last time. A dark bar tells you you're offline.",
          "**Daily updates** (with photos) can be written offline — they send by themselves when the signal returns.",
          "Changing tasks and sending chat messages need a connection. You'll see a clear message if it fails — just try again.",
        ],
      },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    icon: "ShieldCheck",
    summary: "Approving people, access levels, invitations and settings.",
    minRole: "admin",
    where: "Admin",
    guides: [
      {
        title: "Approve a new person",
        steps: [
          "Open **Admin**. People who signed up are under **Waiting for approval**.",
          "Choose their **Level** (Administrator, Manager, Technician or Basic).",
          "Tap **Approve** — or **Decline**.",
        ],
      },
      {
        title: "Invite someone",
        steps: [
          "In **Admin** tap **Invite someone**.",
          "Enter their email and level, then tap **Send invite**.",
          "They get an email with a link to set their password — no approval needed.",
        ],
      },
      {
        title: "Change someone's level or deactivate them",
        steps: [
          "In **Admin**, find the person (use **Search people**).",
          "Change their **Level**, or tap **Deactivate** to block access straight away. **Reactivate** undoes it.",
        ],
      },
      {
        title: "Fill in or correct someone's name",
        steps: [
          "In **Admin**, find the person (use **Search people**). People without a name show their email and a **No name yet** tag.",
          "Tap the **pencil** next to their name.",
          "Type their **First name** and, if you like, their **Surname**, then tap **Save**.",
          "The name shows straight away everywhere — Home, Daily updates, tasks, chats and material requests.",
        ],
        tip: "They can still change their own name later in **Profile**.",
      },
      {
        title: "Send an important message people can't miss",
        minRole: "admin",
        steps: [
          "Open **Admin** and tap **Important messages**.",
          "Write a short **Title** and the **Message**.",
          "Choose who gets it: **By level** (e.g. Technician), **By project**, **Chosen people** or **Everyone**.",
          "Choose **If not read, send again** (e.g. every 2 hours, 7am–7pm, for up to 3 days), then tap **Send important message**.",
          "They get a phone notification straight away (on Android and computers it stays on screen until tapped), and when they open the app the message covers the screen until they tap **I've read this**.",
          "Under **Sent messages**, see **3 of 8 read** — tap **Show who has read it** for names and times. Delete a message to stop it.",
        ],
        tip: "Repeat sends need the Supabase snippet from **Admin → Setup** (the same one as the daily reminder). People with notifications switched off still see the message when they next open the app.",
      },
      {
        title: "See who is (and isn't) using the app",
        minRole: "admin",
        steps: [
          "Open **Admin** and tap **Activity — who's using the app**.",
          "Everyone is listed with the least active first. **Last active** is when they last opened the app (only the time is kept, not what they looked at).",
          "Dots: 🟢 today · ⚪ in the last 2 days · 🟠 3–6 days ago · 🔴 a week or more, or never.",
          "Technicians also show their **Last daily update**. A bell with a line through it means phone notifications are off — they won't get reminders.",
          "Tap the boxes at the top, or use **Show**, to list only people not active this week, who never opened the app, or who have notifications off.",
        ],
        tip: "“Last active” starts counting from when this feature went live, so at first some people show “Never” until they next open the app.",
      },
      {
        title: "Set the daily update reminder time",
        minRole: "admin",
        steps: [
          "Open **Admin → Settings**.",
          "**Daily update reminder** is on by default. Pick the **Reminder time** (Malta time) — e.g. 16:30 (4:30 pm).",
          "On working days at that time, technicians on active projects who haven't posted yet get a phone notification. It arrives within 15 minutes of the time.",
          "**First time only:** in **Admin → Setup**, tap **Show the Supabase snippet**, copy it and run it once in Supabase → SQL Editor. A green tick shows when it's working.",
        ],
      },
      {
        title: "Settings and setup",
        steps: [
          "**Settings:** choose whether Basic users may write in chats.",
          "**Setup: notifications & daily job:** shows green ticks when phone notifications, emails and daily reminders are working. Tap **Generate keys for Vercel** the first time.",
        ],
      },
    ],
  },
  {
    id: "levels",
    title: "Who can do what",
    icon: "Users",
    summary: "The four access levels.",
    guides: [
      {
        title: "Access levels",
        steps: [
          "**Administrator:** everything — people, settings, all projects, deleting anything.",
          "**Manager:** create projects and run the ones they're on — people, Gantt, exports, client links, daily reports — plus the management chat.",
          "**Technician:** projects they're added to — create and update tasks, daily updates and photos, project chats.",
          "**Basic:** read-only on the projects they're added to.",
        ],
        tip: "Your own level is shown in **Profile → Your access level**. Ask an administrator if you need more access.",
      },
    ],
  },
];
