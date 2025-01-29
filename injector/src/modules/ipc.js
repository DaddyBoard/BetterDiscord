import {spawn} from "child_process";
import {ipcMain as ipc, BrowserWindow, app, dialog, systemPreferences, shell} from "electron";

import * as IPCEvents from "common/constants/ipcevents";

const getPath = (event, pathReq) => {
    let returnPath;
    switch (pathReq) {
        case "appPath":
            returnPath = app.getAppPath();
            break;
        case "appData":
        case "userData":
        case "home":
        case "cache":
        case "temp":
        case "exe":
        case "module":
        case "desktop":
        case "documents":
        case "downloads":
        case "music":
        case "pictures":
        case "videos":
        case "recent":
        case "logs":
            returnPath = app.getPath(pathReq);
            break;
        default:
            returnPath = "";
    }

    event.returnValue = returnPath;
};

const openPath = (event, path) => {
    if (process.platform === "win32") spawn("explorer.exe", [path]);
    else shell.openPath(path);
};

const relaunch = (event, args = []) => {
    app.relaunch({args: process.argv.slice(1).concat(Array.isArray(args) ? args : [args])});
    app.quit();
};

const runScript = async (event, script) => {
    try {
        // TODO: compile with vm to prevent escape with clever strings
        await event.sender.executeJavaScript(`(() => {try {${script}} catch {}})();`);
    }
    catch (e) {
        // TODO: cut a log
    }
};

const openDevTools = event => event.sender.openDevTools();
const closeDevTools = event => event.sender.closeDevTools();
const toggleDevTools = event => {
    if (!event.sender.isDevToolsOpened()) openDevTools(event);
    else closeDevTools(event);
};

const createBrowserWindow = (event, url, {windowOptions, closeOnUrl} = {}) => {
    return new Promise(resolve => {
        const windowInstance = new BrowserWindow(windowOptions);
        windowInstance.webContents.on("did-navigate", (_, navUrl) => {
            if (navUrl != closeOnUrl) return;
            windowInstance.close();
            resolve();
        });
        windowInstance.loadURL(url);
    });
};

const inspectElement = async event => {
    if (!event.sender.isDevToolsOpened()) {
        event.sender.openDevTools();
        while (!event.sender.isDevToolsOpened()) await new Promise(r => setTimeout(r, 100));
    }
    event.sender.devToolsWebContents.executeJavaScript("DevToolsAPI.enterInspectElementMode();");
};

const setMinimumSize = (event, width, height) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.setMinimumSize(width, height);
};

const setWindowSize = (event, width, height) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window.setSize(width, height);
};

const getAccentColor = () => {
    // intentionally left blank so that fallback colors will be used
    return systemPreferences.getAccentColor() || "";
};

const stopDevtoolsWarning = event => event.sender.removeAllListeners("devtools-opened");

const openDialog = (event, options = {}) => {
    const {
        mode = "open", 
        openDirectory = false, 
        openFile = true,
        multiSelections = false,
        filters,
        promptToCreate = false,
        defaultPath,
        title,
        showOverwriteConfirmation,
        message,
        showHiddenFiles,
        modal = false
    } = options;
    const openFunction = {
        open: dialog.showOpenDialog,
        save: dialog.showSaveDialog
    }[mode];
    if (!openFunction) return Promise.resolve({error: "Unkown Mode: " + mode});

    return openFunction.apply(dialog, [
        modal && BrowserWindow.fromWebContents(event.sender), 
        {
            defaultPath,
            filters,
            title,
            message,
            createDirectory: true,
            properties: [
                showHiddenFiles && "showHiddenFiles",
                openDirectory && "openDirectory",
                promptToCreate && "promptToCreate",
                openDirectory && "openDirectory",
                openFile && "openFile",
                multiSelections && "multiSelections",
                showOverwriteConfirmation && "showOverwriteConfirmation"
            ].filter(e => e),
        }
    ].filter(e => e));
};
const registerPreload = (event, path) => {
    app.commandLine.appendSwitch("preload", path);
};

export default class IPCMain {
    static registerEvents() {
        try {
            ipc.on(IPCEvents.GET_PATH, getPath);
            ipc.on(IPCEvents.OPEN_PATH, openPath);
            ipc.on(IPCEvents.RELAUNCH, relaunch);
            ipc.on(IPCEvents.OPEN_DEVTOOLS, openDevTools);
            ipc.on(IPCEvents.CLOSE_DEVTOOLS, closeDevTools);
            ipc.on(IPCEvents.TOGGLE_DEVTOOLS, toggleDevTools);
            ipc.on(IPCEvents.INSPECT_ELEMENT, inspectElement);
            ipc.on(IPCEvents.MINIMUM_SIZE, setMinimumSize);
            ipc.on(IPCEvents.WINDOW_SIZE, setWindowSize);
            ipc.on(IPCEvents.DEVTOOLS_WARNING, stopDevtoolsWarning);
            ipc.on(IPCEvents.REGISTER_PRELOAD, registerPreload);
            ipc.handle(IPCEvents.GET_ACCENT_COLOR, getAccentColor);
            ipc.handle(IPCEvents.RUN_SCRIPT, runScript);
            ipc.handle(IPCEvents.OPEN_DIALOG, openDialog);
            ipc.handle(IPCEvents.OPEN_WINDOW, createBrowserWindow);
        }
        catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
        }
    }
}