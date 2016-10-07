import React, {Component} from 'react';
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
            columns = [controls.metricColumn, controls.metricType];
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
            inputJson.aggs = {
                'agg1': {
                    'terms': {
                        'field': controls.aggregationColumn
                    },

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
                aggregationColumn: '',

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

        // Some controls depend on each other
        if (controls.aggregationColumn &&
            (controls.metricType === 'value_count' ||
             controls.metricType === '')
        ) {
            // elasticsearch is implicitly computing 'count' over the aggregationColumn
            controls.metricColumn = controls.aggregationColumn;
            controls.metricType = 'value_count';
        }

        /*
         * Every metric besides value_counts requires a numeric column.
         * So, if the user just switched from e.g. value_counts to avg,
         * check if we need to clear the column
         */
        if (controls.metricType !== 'value_count' &&
            columnTypes[controls.metricColumn] !== 'numeric'
        ) {
            controls.metricColumn = null;
        }

        this.setState(this.state);
        this.executeQuery(controls)

    }

    rawQuery(payload) {
        const protocol = window.location.protocol;
        console.warn('protocol: ', protocol);
        const elasticUrl = '//67a7441549120daa2dbeef8ac4f5bb2e.us-east-1.aws.found.io:9200';
        const indexName = 'sample-data';
        const typeId = 'test-type';
        this.setState({status: 'loading...'});
        const request = `${protocol}${elasticUrl}/${indexName}/_search`;
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

        const groupby = (
            <div>
                <label>
                    Group by
                </label>
                <div style={{width: 300}}>
                    <Select
                        options={elasticsearchColumns.map(c => ({label: c, value: c}))}
                        onChange={option => this.updateControl('aggregationColumn', option.value)}
                        value={controls.aggregationColumn}
                    />
                </div>
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
                        onChange={option => this.updateControl('metricType', option.value)}
                        disabled={controls.metricColumn === ''}
                    />
                </div>

                <label>
                    Over column
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
                        onChange={option => this.updateControl('metricColumn', option.value)}
                        value={controls.metricColumn}
                        disabled={!controls.metricType || controls.metricType === 'value_count'}
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

                <div>
                    {this.state.status}
                </div>

                <div style={{color: 'red'}}>
                    {this.state.outputError}
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
