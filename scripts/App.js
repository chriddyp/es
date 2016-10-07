import React, {Component, PropTypes} from 'react';
import Select from 'react-select';

const Table = props => {
    const {rows, columns} = props;

    return (
        <table>
            <thead>
                <tr>
                    {columns.map(column => <th>{column}</th>)}
                </tr>
            </thead>

            <tbody>
                {
                    rows.map(row =>
                        <tr>
                            {row.map(cell => <td>{cell}</td>)}
                        </tr>
                    )
                }
            </tbody>
        </table>
    );
}

class RangeAggregation extends Component {
    constructor(props) {
        super(props);
        this.state = {
            ranges: [
                {from: null, to: null}
            ]
        };

        this.renderRange = this.renderRange.bind(this);
    }

    renderRange(index) {
        const {onChange, type} = this.props;
        // TODO - Add deleting ranges
        const inputType = type === 'numeric' ? 'number' : 'text';
        return (
            <div>
                <label>
                    min
                </label>
                <input
                    type={inputType}
                    onChange={e => {
                        const ranges = this.state.ranges;
                        ranges[index].from = e.target.value;
                        this.setState({ranges})
                        onChange(ranges)
                    }}
                    value={this.state.ranges[index].from}
                />

                <label>
                    max
                </label>
                <input
                    type={inputType}
                    onChange={e => {
                        const ranges = this.state.ranges;
                        ranges[index].to = e.target.value;
                        this.setState({ranges})
                        onChange(ranges)
                    }}
                    value={this.state.ranges[index].to}
                />
            </div>
        );
    }

    render() {
        return (
            <div>
                {this.state.ranges.map((v, i) => this.renderRange(i))}
                <button onClick={() => {
                    this.state.ranges.push({from: null, to: null});
                    this.setState({ranges: this.state.ranges});
                }}>
                    Add Range
                </button>
            </div>
        )
    }
};

RangeAggregation.propTypes = {
    onChange: PropTypes.func.isRequired,
    type: PropTypes.oneOf(['numeric', 'date', 'ipv4'])
};

const FiltersAggregation = props => {
    const {filters, setFilters, columns} = props;

    return (
        <div>
            {filters.map(filter => {

                return (
                    <div style={{width: 300}}>
                        <label>column</label>
                        <Select
                            options={columns.map(c=>({label: c, value: c}))}
                            onChange={option=>{
                                filters
                            }}
                        />

                        <label>filter term</label>
                        <input type="text"/>
                    </div>
                );

            })}

            <button onClick={() => {
                filters.push({});
                setFilters(filters)
            }}>
                Add filter
            </button>

        </div>
    );
}


const AGGREGATION_PROPERTIES = {
    terms: ['orderby', 'order', 'size'],
    histogram: ['interval'],
    range: ['ranges'],
    date_range: ['ranges'],
    ipv4_range: ['ranges'],
    significant_terms: ['size'],
    filters: []
}

const AGGREGATION_TYPES = {
    terms: 'any',
    histogram: 'numeric',
    range: 'numeric',
    date_range: 'date',
    ipv4_range: 'ipv4',
    significant_terms: 'string',
    filters: 'any'
}

function outputJsonToColumnData(controls, outputJson) {
    let columns = [];
    let rows = [];

    if (!outputJson) return {columns, rows};

    if (outputJson.aggregations) {
        const aggregation = outputJson.aggregations.agg1;
        const buckets = aggregation.buckets;
        if (buckets.length === 0) {
            columns = [];
            rows = [[]];
        } else {
            columns = [
                `${controls.aggregationColumn}`,
                `${controls.metricType} by ${controls.metricColumn}`
            ];
            rows = buckets.map(bucket => [bucket.key, bucket.agg2.value]);
        }
    }
    else if (outputJson.hits && outputJson.hits.hits) {
        rows = outputJson.hits.hits.map(hit => {
            columns = Object.keys(hit._source);
            return columns.map(
                key => JSON.stringify(hit._source[key])
            )
        })
    }
    return {rows, columns};
}

function controlsToJson(controls) {
    let inputJson = {};
    if (controls.search) {
        inputJson = {
            'query': {
                'query_string': {
                    'query': controls.search
                }
            }
        };
    }
    if (controls.aggregationColumn) {
        if (!controls.metricColumn) {
            inputJson = null;
        } else {
            const propertyNames = AGGREGATION_PROPERTIES[controls.aggregationType];
            const aggregation = propertyNames.reduce((r, v) => {
                if(controls[v]) r[v] = controls[v];
                return r;
            }, {});
            aggregation.field = controls.aggregationColumn;
            inputJson.aggs = {
                'agg1': {
                    [controls.aggregationType]: aggregation,
                    'aggs': {
                        'agg2': {
                            [controls.metricType]: {
                                field: controls.metricColumn
                            }
                        }
                    }
                }
            };
        }
    }
    return inputJson;
}

export default class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            controls: {
                search: '*',

                aggregationType: '',
                aggregationColumn: '',

                // aggregation properties
                // term aggregation
                orderby: null,
                order: null,
                size: null,

                // histogram aggregation
                interval: null,

                // range* aggregations
                ranges: null,

                // filters aggregation
                filters: [],

                metricType: '',
                metricColumn: ''
            },
            outputJson: {},
            outputError: '',
            status: '',

            // info about the underlying elasticsearch database
            elasticsearchColumns: [],
            columnTypes: {}
        }

        this.updateControl = this.updateControl.bind(this);
        this.rawQuery = this.rawQuery.bind(this);
        this.executeQuery = this.executeQuery.bind(this);
    }

    updateControl(controlId, value) {
        const {controls, columnTypes} = this.state;
        controls[controlId] = value;

        // set metricColumn and metricType to count when they are undefined
        if (controls.aggregationColumn &&
            controls.metricType === ''
        ) {

            controls.metricColumn = controls.aggregationColumn;
            controls.metricType = 'value_count';
        }

        /*
         * some metric types are type specific.
         * clear the column if the type isn't valid
         */
        if (controls.aggregationColumn) {
            if (controls.aggregationType === 'terms') {
                // any type is OK
            } else if (controls.aggregationType === 'histogram') {
                if (columnTypes[controls.aggregationColumn] !== 'numeric') {
                    controls.aggregationColumn = '';
                }
            } else if (controls.aggregationType === 'range') {
                if (columnTypes[controls.aggregationColumn] !== 'numeric') {
                    controls.aggregationColumn = '';
                }
            } else if (controls.aggregationType === 'date_range') {
                if (columnTypes[controls.aggregationColumn] !== 'date') {
                    controls.aggregationColumn = '';
                }
            } else if (controls.aggregationType === 'ipv4_range') {
                if (columnTypes[controls.aggregationColumn] !== 'ipv4') {
                    controls.aggregationColumn = '';
                }
            } else if (controls.aggregationType === 'range') {
                if (columnTypes[controls.aggregationColumn] !== 'numeric') {
                    controls.aggregationColumn = '';
                }
            } else if (controls.aggregationType === 'significant_terms') {
                // i think any type is OK here
            }
        }


        /*
         * Every metric besides value_counts requires a numeric column.
         * So, if the user just switched from e.g. value_counts to avg,
         * check if we need to clear the column
         */
        if (controls.metricType !== 'value_count' &&
            columnTypes[controls.metricColumn] !== 'numeric'
        ) {
            controls.metricColumn = '';
        }

        controls[controlId] = value; // TODO - fix up this json serialization and reserialization
        this.setState(this.state);
        this.executeQuery(controls)

    }

    rawQuery(payload) {
        const protocol = window.location.protocol;
        // TODO - get elastic.co to work with https
        console.warn('protocol: ', protocol);
        let elasticUrl;
        if (protocol === 'https:') {
            elasticUrl = 'https://67a7441549120daa2dbeef8ac4f5bb2e.us-east-1.aws.found.io:9243';
        } else {
            elasticUrl = 'http://67a7441549120daa2dbeef8ac4f5bb2e.us-east-1.aws.found.io:9200';
        }

        const indexName = 'sample-data';
        const typeId = 'test-type';
        this.setState({status: 'loading...'});
        const request = `${elasticUrl}/${indexName}/_search`;
        console.warn('request: ', request);
        const body = JSON.stringify(payload);

        return fetch(request,{
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body: body
        }).then(response => {
            this.setState({status: ''});
            return response.json();
        });

    }

    executeQuery(controls) {
        const inputJson = controlsToJson(controls);
        if (!inputJson) {
            return;
        }
        this.rawQuery(inputJson).then(json => {
            this.setState({outputJson: json});
            this.setState({outputError: ''});
        }).catch(error => {
            this.setState({status: 'error - check your console'});
            console.log(error);
            this.setState({outputError: JSON.stringify(error)});
        });
    }

    componentDidMount() {
        const {controls} = this.state;
        this.rawQuery({query: {query_string: {query: '*'}}}).then(outputJson => {
            const {rows, columns} = outputJsonToColumnData(controls, outputJson);
            console.warn('columns: ', columns, outputJson);
            this.setState({
                elasticsearchColumns: columns,
                outputJson,

                // TODO - get this info from elasticsearch somehow
                columnTypes: {
                    'my-string-1': 'string',
                    'my-string-2': 'string',

                    'my-number-1': 'numeric',
                    'my-number-2': 'numeric',

                    'my-date-1': 'date',
                    'my-date-2': 'date',

                    'my-geo-point-1': 'geo-point',
                    'my-geo-point-2': 'geo-point',

                    'my-boolean-1': 'boolean',
                    'my-boolean-2': 'boolean'
                }

            });

        });

    }

    render() {
        const {
            outputJson,
            controls,
            elasticsearchColumns,
            columnTypes
        } = this.state;
        const inputJson = controlsToJson(controls);
        let rows = [[]];
        let columns = [];
        try {
            ({rows, columns} = outputJsonToColumnData(controls, outputJson));
        } catch (e) {}

        const search = (
            <div>
                <label>Search</label>
                <input
                    type="text"
                    value={controls.search}
                    onChange={e => this.updateControl('search', e.target.value)}
                />
            </div>
        );

        const aggregationMetric = (
            <div>
                <label>
                    aggregation by
                </label>
                <div style={{width: 300}}>
                    <Select
                        options={[
                            {label: 'terms', value: 'terms'},
                            {label: 'histogram', value: 'histogram'},
                            {label: 'range', value: 'range'},
                            {label: 'date_range', value: 'date_range'},
                            {label: 'ipv4_range', value: 'ipv4_range'},
                            {label: 'filters', value: 'filters'},
                            {label: 'significant_terms', value: 'significant_terms'}
                        ]}
                        onChange={option => this.updateControl('aggregationType', option ? option.value : '')}
                        value={controls.aggregationType}
                    />
                </div>
            </div>
        );

        let aggregationColumn = null;
        if (controls.aggregationType !== 'filters') {
            aggregationColumn = (
                <div>
                    <label>
                        over column
                    </label>
                    <div style={{width: 300}}>
                        <Select
                            options={elasticsearchColumns.map(c => (
                                {
                                    label: c,
                                    value: c,
                                    disabled: !(
                                        AGGREGATION_TYPES[controls.aggregationType] === 'any' ||
                                        columnTypes[c] === AGGREGATION_TYPES[controls.aggregationType]
                                    )
                                }
                            ))}
                            onChange={option => this.updateControl('aggregationColumn', option ? option.value : '')}
                            value={controls.aggregationColumn}
                            disabled={!controls.aggregationType}
                        />
                    </div>
                </div>
            );
        }

        let aggregationProperties = null;
        if (controls.aggregationType === 'terms') {
            // orderby (metric like count)
            // order - ascending, descending
            // size - integer
            aggregationProperties = (
                <div>
                    <div style={{width: 300}}>
                        <label>
                            order
                        </label>
                        <Select
                            options={[
                                {label: 'ascending alphabetical', value: JSON.stringify({'_term': 'asc'})},
                                {label: 'descending alphabetical', value: JSON.stringify({'_term': 'desc'})},
                                {label: 'ascending count', value: JSON.stringify({'_count': 'asc'})},
                                {label: 'descending count', value: JSON.stringify({'_count': 'desc'})}
                            ]}
                            value={JSON.stringify(controls.order)}
                            onChange={option => this.updateControl('order', JSON.parse(option.value))}
                        />
                    </div>

                    <div>
                        <label>
                            size
                        </label>
                        <input
                            type="number"
                            onChange={e => this.updateControl('size', e.target.value)}
                            value={controls.size}
                        />
                    </div>
                </div>
            );
            // TODO - Add orderby aggregation
        } else if (controls.aggregationType === 'histogram') {
            aggregationProperties = (
                <div>
                    <label>
                        with interval
                    </label>
                    <input
                        type="number"
                        onChange={e => this.updateControl('interval', e.target.value)}
                        value={controls.interval}
                    />
                </div>
            );
        } else if (controls.aggregationType === 'range') {
            aggregationProperties = (
                // TODO - ranges state should be managed entirely by this component
                // so that we can pass initial values
                <RangeAggregation
                    type={'numeric'}
                    onChange={ranges => this.updateControl('ranges', ranges)}
                />
            );
        } else if (controls.aggregationType === 'date_range') {
            aggregationProperties = (
                <RangeAggregation
                    type={'date'}
                    onChange={ranges => this.updateControl('ranges', ranges)}
                />
            );
        } else if (controls.aggregationType === 'ipv4_range') {
            aggregationProperties = (
                <RangeAggregation
                    type={'ipv4'}
                    onChange={ranges => this.updateControl('ranges', ranges)}
                />
            );
        } else if (controls.aggregationType === 'filters') {
            aggregationProperties = (
                <FiltersAggregation
                    columns={elasticsearchColumns}
                    filters={controls.filters}
                    setFilters={filters => {
                        this.state.controls.filters = filters;
                        this.setState({controls: this.state.controls});
                    }}
                />
            );
        } else if (controls.aggregationType === 'significant_terms') {
            aggregationProperties = (
                <div>
                    <label>
                        size
                    </label>
                    <input
                        type="number"
                        onChange={e => this.updateControl('size', e.target.value)}
                        value={controls.size}
                    />
                </div>
            );
        }


        const groupby = (
            <div>
                {aggregationMetric}
                {aggregationColumn}
                {aggregationProperties}
            </div>
        );

        const computeby = (
            <div>
                <label>
                    Compute
                </label>
                <div style={{width: 300}}>
                    <Select
                        options={[
                            {label: 'count', value: 'value_count'},
                            {label: 'avg', value: 'avg'},
                            {label: 'max', value: 'max'},
                            {label: 'min', value: 'min'},
                            {label: 'sum', value: 'sum'},
                            {label: 'cardinality', value: 'cardinality'}
                        ]}
                        value={controls.metricType}
                        onChange={option => this.updateControl('metricType', option ? option.value : '')}
                        disabled={controls.metricColumn === ''}
                    />
                </div>

                <label>
                    over column
                </label>
                <div style={{width: 300}}>
                    <Select
                        options={elasticsearchColumns.map(c => ({
                            label: c,
                            value: c,
                            disabled: (
                                columnTypes[c] !== 'numeric' &&
                                controls.metricType !== 'value_count'
                            )
                        }))}
                        onChange={option => this.updateControl('metricColumn', option ? option.value : '')}
                        value={controls.metricColumn}
                        disabled={
                            !Boolean(controls.metricType) ||
                            (controls.metricType === 'value_count')
                        }
                    />
                </div>

            </div>
        )

        return (
            <div>
                <h1>ElasticSearch Query Editor</h1>

                {search}

                <hr/>

                <div className="row">
                    <div className="six columns">
                        {groupby}
                    </div>
                    <div className="six columns">
                        {computeby}
                    </div>
                </div>

                <hr/>
                <hr/>

                <div className="row">
                    <div className="four columns">
                        <h5>Generated JSON</h5>
                        <pre>
                            {
                                JSON.stringify(inputJson, null, 2)
                            }
                        </pre>
                    </div>

                    <div className="four columns">
                        <h5>Output JSON</h5>
                        <pre>
                            {
                                JSON.stringify(outputJson, null, 2)
                            }
                        </pre>
                    </div>

                    <div className="four columns">
                        <h5>Table</h5>
                        <Table rows={rows} columns={columns}/>
                    </div>
                </div>
            </div>
        );
    }
}
