import React from "react"
import { action, computed, observable, runInAction, reaction } from "mobx"
import { observer } from "mobx-react"
import { Flipper, Flipped } from "react-flip-toolkit"
import { bind } from "decko"
import classnames from "classnames"
import { ScaleLinear } from "d3-scale"

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faSearch } from "@fortawesome/free-solid-svg-icons/faSearch"
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes"

import { FuzzySearch } from "charts/FuzzySearch"
import { partition, sortBy, scrollIntoViewIfNeeded, last } from "charts/Util"
import { CovidDataExplorer } from "./CovidDataExplorer"
import { CountryOption } from "./CovidTypes"
import { VerticalScrollContainer } from "charts/VerticalScrollContainer"
import { Analytics } from "site/client/Analytics"

enum FocusDirection {
    first = "first",
    last = "last",
    up = "up",
    down = "down"
}

/** Modulo that wraps negative numbers too */
function mod(n: number, m: number) {
    return ((n % m) + m) % m
}

@observer
export class CountryPicker extends React.Component<{
    covidDataExplorer: CovidDataExplorer
    toggleCountryCommand: (countryCode: string, value?: boolean) => void
    isDropdownMenu?: boolean
}> {
    @observable private searchInput?: string
    @observable private searchInputRef: React.RefObject<
        HTMLInputElement
    > = React.createRef()

    @observable private focusIndex?: number
    @observable private focusRef: React.RefObject<
        HTMLLabelElement
    > = React.createRef()
    @observable private scrollFocusedIntoViewOnUpdate: boolean = false

    @observable private blockOptionHover: boolean = false

    @observable private scrollContainerRef: React.RefObject<
        HTMLDivElement
    > = React.createRef()

    @observable private isOpen: boolean = false

    @computed private get isDropdownMenu(): boolean {
        return !!this.props.isDropdownMenu
    }

    @action.bound private selectCountryCode(code: string, checked?: boolean) {
        this.props.toggleCountryCommand(code, checked)
        // Clear search input
        this.searchInput = ""
        Analytics.logCovidCountrySelector(checked ? "select" : "deselect", code)
    }

    @computed private get options(): CountryOption[] {
        return this.props.covidDataExplorer.countryOptions
    }

    @computed private get selectedOptions(): CountryOption[] {
        return this.props.covidDataExplorer.selectedCountryOptions
    }

    @computed private get optionColorMap() {
        return this.props.covidDataExplorer.countryCodeToColorMap
    }

    @bind private isSelected(option: CountryOption) {
        return this.selectedOptions.includes(option)
    }

    @computed private get fuzzy(): FuzzySearch<CountryOption> {
        return new FuzzySearch(this.options, "name")
    }

    @computed private get searchResults(): CountryOption[] {
        if (this.searchInput) {
            return this.fuzzy.search(this.searchInput)
        }
        // Show the selected up top and in order.
        const [selected, unselected] = partition(
            sortBy(this.options, r => r.name),
            this.isSelected
        )
        return [...selected, ...unselected]
    }

    @computed private get focusableOptions(): CountryOption[] {
        return this.searchResults
    }

    private normalizeFocusIndex(index: number): number | undefined {
        if (this.focusableOptions.length === 0) return undefined
        return mod(index, this.focusableOptions.length)
    }

    @computed private get focusedOption(): CountryOption | undefined {
        return this.focusIndex !== undefined
            ? this.focusableOptions[this.focusIndex]
            : undefined
    }

    @computed private get showDoneButton(): boolean {
        return this.isDropdownMenu && this.isOpen
    }

    @action.bound private focusOptionDirection(direction: FocusDirection) {
        if (direction === FocusDirection.first) {
            this.focusIndex = this.normalizeFocusIndex(0)
        } else if (direction === FocusDirection.last) {
            this.focusIndex = this.normalizeFocusIndex(-1)
        } else if (direction === FocusDirection.up) {
            const newIndex =
                this.focusIndex === undefined ? -1 : this.focusIndex - 1
            this.focusIndex = this.normalizeFocusIndex(newIndex)
        } else if (direction === FocusDirection.down) {
            const newIndex =
                this.focusIndex === undefined ? 0 : this.focusIndex + 1
            this.focusIndex = this.normalizeFocusIndex(newIndex)
        } else {
            // Exit without updating scroll
            return
        }
        this.scrollFocusedIntoViewOnUpdate = true
    }

    @action.bound private clearSearchInput() {
        if (this.searchInput) {
            this.searchInput = ""
        }
    }

    @action.bound private onKeyDown(
        event: React.KeyboardEvent<HTMLDivElement>
    ) {
        // We want to block hover if a key is pressed.
        // The hover will be unblocked iff the user moves the mouse (relative to the menu).
        this.blockHover()
        switch (event.key) {
            case "Enter":
                if (event.keyCode === 229) {
                    // ignore the keydown event from an Input Method Editor(IME)
                    // ref. https://www.w3.org/TR/uievents/#determine-keydown-keyup-keyCode
                    break
                }
                if (!this.focusedOption) return
                const { code } = this.focusedOption
                this.selectCountryCode(code)
                this.clearSearchInput()
                Analytics.logCovidCountrySelector("enter", code)
                break
            case "ArrowUp":
                this.focusOptionDirection(FocusDirection.up)
                break
            case "ArrowDown":
                this.focusOptionDirection(FocusDirection.down)
                break
            default:
                return
        }
        event.preventDefault()
    }

    @bind focusSearch() {
        this.searchInputRef.current?.focus()
    }

    @action.bound private onSearchFocus() {
        this.isOpen = true
        if (this.focusIndex === undefined) {
            this.focusOptionDirection(FocusDirection.first)
        }
    }

    @action.bound private onSearchBlur(
        event: React.FocusEvent<HTMLInputElement>
    ) {
        // Do not allow focus on elements inside menu; shift focus back to search input.
        if (
            this.scrollContainerRef.current &&
            this.scrollContainerRef.current.contains(document.activeElement)
        ) {
            this.focusSearch()
            return
        }
        this.isOpen = false
        this.focusIndex = undefined
    }

    @action.bound private onHover(option: CountryOption, index: number) {
        if (!this.blockOptionHover) {
            this.focusIndex = index
        }
    }

    @action.bound private blockHover() {
        this.blockOptionHover = true
    }

    @action.bound private unblockHover() {
        this.blockOptionHover = false
    }

    @action.bound private onMenuMouseDown(
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) {
        event.stopPropagation()
        event.preventDefault()
        this.focusSearch()
    }

    @bind private highlightLabel(label: string): JSX.Element | string {
        if (this.searchInput) {
            const result = this.fuzzy.single(this.searchInput, label)
            if (result) {
                const tokens: { match: boolean; text: string }[] = []
                for (let i = 0; i < result.target.length; i++) {
                    const currentToken = last(tokens)
                    const match = result.indexes.includes(i)
                    const char = result.target[i]
                    if (!currentToken || currentToken.match !== match) {
                        tokens.push({
                            match,
                            text: char
                        })
                    } else {
                        currentToken.text += char
                    }
                }
                return (
                    <React.Fragment>
                        {tokens.map((token, i) =>
                            token.match ? (
                                <mark key={i}>{token.text}</mark>
                            ) : (
                                <React.Fragment key={i}>
                                    {token.text}
                                </React.Fragment>
                            )
                        )}
                    </React.Fragment>
                )
            }
        }
        return label
    }

    componentDidMount() {
        // Whenever the search term changes, shift focus to first option in the list
        reaction(
            () => this.searchInput,
            () => {
                this.focusOptionDirection(FocusDirection.first)
            }
        )
    }

    componentDidUpdate() {
        if (
            this.focusIndex !== undefined &&
            this.scrollFocusedIntoViewOnUpdate &&
            this.scrollContainerRef.current &&
            this.focusRef.current
        ) {
            scrollIntoViewIfNeeded(
                this.scrollContainerRef.current,
                this.focusRef.current
            )
            runInAction(() => {
                this.scrollFocusedIntoViewOnUpdate = false
            })
        }
    }

    render() {
        const countries = this.searchResults
        const selectedCountries = this.selectedOptions
        const availableCountries = this.props.covidDataExplorer
            .availableCountriesForMetric

        return (
            <div className="CountryPicker" onKeyDown={this.onKeyDown}>
                <div className="CovidSearchInput">
                    <input
                        className={classnames("input-field", {
                            "with-done-button": this.showDoneButton
                        })}
                        type="text"
                        placeholder="Type to add a country..."
                        value={this.searchInput ?? ""}
                        onChange={e =>
                            (this.searchInput = e.currentTarget.value)
                        }
                        onFocus={this.onSearchFocus}
                        onBlur={this.onSearchBlur}
                        ref={this.searchInputRef}
                        data-track-note="covid-country-search-input"
                    />
                    <div className="search-icon">
                        <FontAwesomeIcon icon={faSearch} />
                    </div>
                    {this.showDoneButton && (
                        <div className="done">
                            <button>Done</button>
                        </div>
                    )}
                </div>
                <div className="CountryListContainer">
                    {(!this.isDropdownMenu || this.isOpen) && (
                        <div
                            className={classnames("CountryList", {
                                isDropdown: this.isDropdownMenu
                            })}
                            onMouseDown={this.onMenuMouseDown}
                        >
                            <VerticalScrollContainer
                                scrollingShadows={true}
                                scrollLock={true}
                                className="CountrySearchResults"
                                contentsId={countries
                                    .map(c => c.name)
                                    .join(",")}
                                onMouseMove={this.unblockHover}
                                ref={this.scrollContainerRef}
                            >
                                <Flipper
                                    spring={{
                                        stiffness: 300,
                                        damping: 33
                                    }}
                                    // We only want to animate when the selection changes, but not on changes due to
                                    // searching
                                    flipKey={selectedCountries
                                        .map(s => s.name)
                                        .join(",")}
                                >
                                    {countries.map((option, index) => (
                                        <CovidCountryOption
                                            key={index}
                                            hasDataForActiveMetric={availableCountries.has(
                                                option.name
                                            )}
                                            option={option}
                                            highlight={this.highlightLabel}
                                            barScale={
                                                this.props.covidDataExplorer
                                                    .barScale
                                            }
                                            color={
                                                this.optionColorMap[option.code]
                                            }
                                            onChange={this.selectCountryCode}
                                            onHover={() =>
                                                this.onHover(option, index)
                                            }
                                            isSelected={this.isSelected(option)}
                                            isFocused={
                                                this.focusIndex === index
                                            }
                                            innerRef={
                                                this.focusIndex === index
                                                    ? this.focusRef
                                                    : undefined
                                            }
                                        />
                                    ))}
                                </Flipper>
                            </VerticalScrollContainer>
                            <div className="CountrySelectionControls">
                                <div
                                    className="ClearSelectionButton"
                                    data-track-note="covid-clear-selection"
                                    onClick={
                                        this.props.covidDataExplorer
                                            .clearSelectionCommand
                                    }
                                >
                                    <FontAwesomeIcon icon={faTimes} /> Clear
                                    selection
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }
}

interface CovidCountryOptionProps {
    option: CountryOption
    highlight: (label: string) => JSX.Element | string
    onChange: (code: string, checked: boolean) => void
    onHover?: () => void
    innerRef?: React.RefObject<HTMLLabelElement>
    isFocused?: boolean
    isSelected?: boolean
    barScale?: ScaleLinear<number, number>
    color?: string
    hasDataForActiveMetric: boolean
}

class CovidCountryOption extends React.Component<CovidCountryOptionProps> {
    @bind onClick(event: React.MouseEvent<HTMLLabelElement, MouseEvent>) {
        event.stopPropagation()
        event.preventDefault()
        this.props.onChange(this.props.option.code, !this.props.isSelected)
    }

    render() {
        const {
            option,
            innerRef,
            isSelected,
            isFocused,
            hasDataForActiveMetric,
            highlight,
            color
        } = this.props
        return (
            <Flipped flipId={option.name} translate opacity>
                <label
                    className={classnames(
                        "CountryOption",
                        {
                            selected: isSelected,
                            focused: isFocused
                        },
                        hasDataForActiveMetric ? undefined : "MissingData"
                    )}
                    onMouseMove={this.props.onHover}
                    onMouseOver={this.props.onHover}
                    onClick={this.onClick}
                    ref={innerRef}
                >
                    <div className="input-container">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            value={option.code}
                            tabIndex={-1}
                            readOnly
                        />
                    </div>
                    <div className="info-container">
                        <div className="labels-container">
                            <div className="name">{highlight(option.name)}</div>
                            {/* Hide testing numbers as they lack labels to be understandable */}
                            {/* {testsPerCase && (
                                <div className="metric">
                                    {testsPerCase.toFixed(1)}
                                </div>
                            )} */}
                        </div>
                        {isSelected && color && (
                            <div className="color-marker-container">
                                <div
                                    className="color-marker"
                                    style={{ backgroundColor: color }}
                                />
                            </div>
                        )}
                        {/* Hide plot as it lacks labels to be understandable */}
                        {/* {barScale && testsPerCase ? (
                            <div className="plot">
                                <div
                                    className="bar"
                                    style={{
                                        width: `${barScale(testsPerCase) *
                                            100}%`
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="plot"></div>
                        )} */}
                    </div>
                </label>
            </Flipped>
        )
    }
}
