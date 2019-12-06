// Static utilities to bind the global window URL to a ChartUrl object.

import { reaction } from "mobx"
import {
    setWindowQueryStr,
    queryParamsToStr,
    QueryParams
} from "utils/client/url"

import { debounce } from "./Util"
import { ChartUrl } from "./ChartUrl"

export function bindUrlToWindow(url: ChartUrl) {
    // There is a surprisingly considerable performance overhead to updating the url
    // while animating, so we debounce to allow e.g. smoother timelines
    const pushParams = () =>
        setWindowQueryStr(queryParamsToStr(url.params as QueryParams))
    const debouncedPushParams = debounce(pushParams, 100)

    reaction(
        () => url.params,
        () => (url.debounceMode ? debouncedPushParams() : pushParams())
    )
}
