export const COMMANDS = {
    settings:   'settings',
    status:     'status',
    positions:  'positions',
    autotrade:  'autotrade',
}

export const MESSAGES_TEXT = {
    websocketSuccessStart: '✅ WebSocket успешно запущен и анализирует данные.',
    websocketWrongStart: '❌ Ошибка при запуске WebSocket:',
    successSetCommandsList: '✅ Список команд успешно установлен',
    setCommandsListError: '❌ Ошибка при установке списка команд',
}

export const BOT_COMMANDS_DATA = {
    update: /^update_(.+)$/,
    openTrade: /^openTrade_(.+)$/,
    settingsMenu: 'settings_menu',
    settingsShowSub: /^settings_show_(.+)$/,
    settingsSetDeposit: /^settings_set_deposit_(.+)$/,
    settingsSetLeverage: /^settings_set_leverage_(.+)$/,
    settingsSetSltp: /^settings_set_sltp_(.+)$/,
    settingsToggleTrailing: 'settings_toggle_trailing',
    settingsToggleLimit: 'settings_toggle_limit',
    confirmTrade: /^confirmTrade_(.+)$/,
    cancelTrade:  /^cancelTrade_(.+)$/,
    autoTradeMenu:        'autotrade_menu',
    autoTradeToggle:      'autotrade_toggle',
    autoTradeShowSub:     /^autotrade_show_(.+)$/,
    autoTradeSetLeverage: /^autotrade_set_leverage_(.+)$/,
    autoTradeSetDeposit:  /^autotrade_set_deposit_(.+)$/,
    autoTradeSetStop:     /^autotrade_set_stop_(.+)$/,
};

export const SETTINGS_OPTIONS = {
    deposits:        [5, 10, 15, 20, 25, 50],
    leverages:       [2, 3, 5, 10, 15, 20],
    sltpPairs:       [[1, 2], [1.5, 3], [2, 4], [2, 6], [3, 6], [3, 9]],
    autoTradeStops:  [3, 5, 10, 15, 20, 30, 50],
};

export const COMMANDS_LIST = [
    { command: "settings",   description: "Настройки бота" },
    { command: "status",     description: "Статус бота" },
    { command: "positions",  description: "Открытые позиции" },
    { command: "autotrade",  description: "Автотрейдинг" },
];
