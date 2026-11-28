import QtQuick
Item {
    id: icon
    property string name
    property color ink: Backend.colors.ink
    width: 20; height: 20; implicitWidth: 20; implicitHeight: 20
    property var paths: ({
        "discover": '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
        "wave": '<path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4"/>',
        "heart": '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
        "list": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        "feed": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h10M7 16h6"/>',
        "history": '<path d="M3 11a9 9 0 1 1 2.5 7M3 5v6h6m3-5v6l4 2"/>',
        "settings": '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 3 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
        "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
        "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
        "back": '<path d="m14 6-6 6 6 6"/>',
        "play": '<path d="m8 4 13 8-13 8Z" fill="currentColor"/>',
        "pause": '<path d="M8 4v16M16 4v16" stroke-width="3"/>',
        "next": '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
        "previous": '<path d="m19 5-10 7 10 7ZM5 5v14"/>',
        "shuffle": '<path d="M3 6h3l12 12h3m-4-4 4 4-4 4M3 18h3l4-4m4-4 4-4h3m-4-4 4 4-4 4"/>',
        "repeat": '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
        "volume": '<path d="M3 9h4l5-5v16l-5-5H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
        "lyrics": '<path d="M4 5h16M4 10h13M4 15h16M4 20h10"/>'
    })
    Image {
        anchors.fill: parent
        sourceSize.width: 40; sourceSize.height: 40
        source: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" color="'+icon.ink+'" stroke="'+icon.ink+'" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(icon.paths[icon.name] || icon.paths.list)+'</svg>')
    }
}
