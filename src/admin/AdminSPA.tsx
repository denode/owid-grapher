import * as React from 'react'
import * as _ from 'lodash'

import webpack from './webpack'
import * as settings from '../settings'

export default function AdminSPA(props: { rootUrl: string, username: string }) {
    const script = `
        window.Global = { rootUrl: "${props.rootUrl}" }
        window.App = {}
        App.isEditor = true
        window.admin = new Admin(Global.rootUrl, "${props.username}", ${JSON.stringify(_.pick(settings, ["ENV"]))})
        admin.start(document.querySelector("#app"))
`

    return <html lang="en">
        <head>
            <title>owid-admin</title>
            <meta name="description" content=""/>
            <link href={webpack("commons.css")} rel="stylesheet" type="text/css"/>
            <link href={webpack("admin.css")} rel="stylesheet" type="text/css"/>
        </head>
        <body>
            <div id="app">
            </div>
            <script src={webpack("commons.js")}></script>
            <script src={webpack("admin.js")}></script>
            <script type="text/javascript" dangerouslySetInnerHTML={{__html: script}}/>
            {/* This lets the public frontend know to show edit links and such */}
            <iframe src="https://ourworldindata.org/identifyadmin" style={{display: 'none'}}/>
        </body>
    </html>
}