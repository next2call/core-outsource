import React, { useState } from "react";
import { DataGrid } from "@mui/x-data-grid";

const PaginatedGrid = ({
  rows,
  columns,
  getRowId = (row) => row.id,
  page: externalPage,
  setPage: externalSetPage,
  pageSize: externalPageSize,
  setPageSize: externalSetPageSize,
  checkboxSelection = false,
}) => {
  const [internalPageSize, setInternalPageSize] = useState(50);
  const [internalPage, setInternalPage] = useState(0);
  const [selectionModel, setSelectionModel] = useState([]);

  const pageSize = externalPageSize ?? internalPageSize;
  const setPageSize = externalSetPageSize ?? setInternalPageSize;
  const page = externalPage ?? internalPage;
  const setPage = externalSetPage ?? setInternalPage;

  return (
    <DataGrid
      className="datagrid"
      rows={rows}
      columns={columns}
      getRowId={getRowId}
      pageSize={pageSize}
      onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
      page={page}
      onPageChange={(newPage) => setPage(newPage)}
      rowsPerPageOptions={[5, 10, 25, 50]}
      pagination
      paginationMode="client"
      rowCount={rows.length}
      checkboxSelection={checkboxSelection}
      selectionModel={selectionModel}
      disableSelectionOnClick={false}
      onSelectionModelChange={(newSelection) => {
        setSelectionModel(newSelection);
      }}
      sx={{
        fontSize: "12px",

        ...(rows.length === 0 && {
          height: "220px !important",

          "& .MuiDataGrid-main": {
            height: "120px !important",
            minHeight: "120px !important",
          },

          "& .MuiDataGrid-virtualScroller": {
            height: "120px !important",
            minHeight: "120px !important",
            overflow: "hidden !important",
          },

          "& .MuiDataGrid-virtualScrollerContent": {
            minHeight: "0px !important",
          },

          "& .MuiDataGrid-overlayWrapper": {
            height: "120px !important",
          },

          "& .MuiDataGrid-overlay": {
            minHeight: "120px !important",
          },

          "& .MuiDataGrid-footerContainer": {
            minHeight: "40px !important",
          },
        })
      }}
    />
  );
};

export default PaginatedGrid;