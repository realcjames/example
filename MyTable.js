import moment from 'moment';
import React from 'react';
import autoBind from 'react-autobind';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Row, Table } from 'react-native-table-component';
import colors from 'src/utils/colors';

export default class MyTable extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);

    this.state = {
      sortIndex: null,
      sortOrder: null,
    };
  }

  render() {
    const { columns = [] } = this.props;
    const { sortIndex, sortOrder } = this.state;

    const widthArr = columns.map(col => col.width);

    let data = this.props.data || [];
    if (sortIndex != null && sortOrder != null) {
      const field = columns[sortIndex].field;
      data = data.concat();
      data.sort((d1, d2) => {
        const v1 = d1[field];
        const v2 = d2[field];
        let result = `${v1}`.localeCompare(`${v2}`);
        if (typeof v1 === 'number' && typeof v2 === 'number') {
          result = v1 - v2;
        }
        return sortOrder === 'asc' ? result : -result;
      });
    }

    let sumRow = null;
    if (
      columns.filter(col => col.showingSum || col.showingPercent).length > 0
    ) {
      sumRow = {};
      columns.forEach(col => {
        let value = null;
        if (col.showingSumTitle) {
          value = '合计';
        } else if (col.showingSum || col.showingPercent) {
          value = data.reduce((acc, row) => acc + row[col.field], 0);
        }
        sumRow[col.field] = value;
      });
    }

    return (
      <ScrollView
        horizontal={true}
        style={[{ backgroundColor: 'white' }, this.props.style]}
      >
        <View>
          <Table borderStyle={{ borderColor: colors.border }}>
            <Row data={columns.map(this.renderHeader)} widthArr={widthArr} />
          </Table>
          <View style={{ marginTop: -1 }}>
            <Table borderStyle={{ borderColor: colors.border }}>
              {data.map((row, index) => (
                <Row
                  key={index}
                  data={columns.map(col =>
                    this.renderCell({
                      row,
                      col,
                      index,
                      sum: (sumRow || {})[col.field],
                    }),
                  )}
                  widthArr={widthArr}
                />
              ))}
            </Table>
            {!!sumRow && (
              <Table borderStyle={{ borderColor: colors.border }}>
                <Row
                  data={columns.map((col, index) =>
                    this.renderCell({ row: sumRow, col, index: -1 }),
                  )}
                  widthArr={widthArr}
                />
              </Table>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  renderHeader(col, index) {
    let sortIcon = require('src/images/icon_sort_none.png');
    if (this.state.sortIndex === index) {
      switch (this.state.sortOrder) {
        case 'asc':
          sortIcon = require('src/images/icon_sort_asc.png');
          break;
        case 'desc':
          sortIcon = require('src/images/icon_sort_desc.png');
          break;
      }
    }

    return (
      <TouchableOpacity
        onPress={() => this.sort(index)}
        style={{
          padding: 4,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#f2f2f2',
        }}
        disabled={!this.props.sortable}
      >
        <Text
          key={index}
          style={{ flex: 1, color: colors.textDarkGray, textAlign: 'center' }}
        >
          {col.title}
        </Text>
        {this.props.sortable && <Image source={sortIcon} />}
      </TouchableOpacity>
    );
  }

  renderCell({ row, col, index, sum }) {
    const cell = row[col.field];

    let align = 'center';
    if (col.align) {
      align = col.align;
    }

    let content = cell;
    if (col.formatter && index >= 0) {
      content = col.formatter(row, col.field);
    }
    if (col.sumFormatter && index < 0) {
      content = col.sumFormatter(row, col.field);
    }
    if (col.showingPercent && index >= 0) {
      content = `${cell}\n(${
        !sum ? 0 : Math.round((cell / sum) * 10000) / 100
      }%)`;
    }

    const Container =
      this.props.onPressRow || col.onPressCol ? TouchableOpacity : View;

    return (
      <Container
        onPress={() => {
          if (col.onPressCol) {
            col.onPressCol(row, index);
          } else if (this.props.onPressRow) {
            this.props.onPressRow(row);
          }
        }}
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: col.backgroundColor
            ? col.backgroundColor
            : index >= 0 && index % 2 === 1
              ? '#fafafa'
              : 'white',
        }}
      >
        {!!cell && !!cell.type ? (
          cell
        ) : (
          <Text
            style={{
              color: col.fontColor || colors.textDarkGray,
              textAlign: align,
              margin: 4,
            }}
          >
            {content}
          </Text>
        )}
      </Container>
    );
  }

  componentDidMount() {
    const sortIndex = this.props.columns.findIndex(col => !!col.defaultSort);
    if (sortIndex >= 0) {
      this.setState({
        sortIndex,
        sortOrder: this.props.columns[sortIndex].defaultSort,
      });
    }
  }

  sort(index) {
    this.setState(prevState => {
      let sortIndex = index;
      let sortOrder = 'asc';
      if (index === prevState.sortIndex) {
        switch (prevState.sortOrder) {
          case 'asc':
            sortOrder = 'desc';
            break;
          case 'desc':
            sortIndex = null;
            sortOrder = null;
            break;
        }
      }
      return {
        sortIndex,
        sortOrder,
      };
    });
  }
}

MyTable.defaultProps = {
  sortable: true,
};

export function timeFormatter(row, field) {
  if (!row) {
    return null;
  }
  const cell = row[field];
  if (!cell) {
    return null;
  }
  return (
    moment(cell).format('YYYY-MM-DD') + '\n' + moment(cell).format('HH:mm:ss')
  );
}
